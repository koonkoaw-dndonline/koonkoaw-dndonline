/*
 * Pure Grid Command board-replacement lease.
 *
 * This module owns no board, callback, timer, storage, or transport. A future
 * host caller may execute only the bounded render effects returned here.
 * language-impact: none — machine-only identities, events, and reason codes.
 */
(function attachGridBoardReplacementLease(root) {
  "use strict";

  const BUILD = "20260801-grid-02a-pure-1";
  const IDENTITY_FIELDS = Object.freeze([
    "campaignId",
    "encounterId",
    "roundId",
    "groupNo",
    "gridId",
    "gridRevision",
  ]);
  const RENDER_TRIGGERS = Object.freeze([
    "poll",
    "safety_poll",
    "resync",
    "full_render",
    "realtime_grid",
    "realtime_token",
    "manual",
    "fallback",
  ]);
  const ACTIVITY_CODES = Object.freeze([
    "tap",
    "select",
    "confirm_attempt",
  ]);
  const EXIT_REASONS = Object.freeze([
    "confirmed",
    "cancelled",
    "fallback",
  ]);
  const EVENT_CODES = Object.freeze([
    "grid_picker_lease",
    "grid_board_render_gate",
    "grid_picker_activity",
    "grid_picker_exit",
    "grid_board_cleanup",
  ]);
  const REASON_CODES = Object.freeze([
    "grid_picker_lease_acquired",
    "grid_picker_lease_replaced",
    "grid_picker_enter_replay",
    "grid_board_same_revision_deferred",
    "grid_board_same_revision_coalesced",
    "grid_board_authoritative_revision",
    "grid_board_render_no_picker",
    "grid_board_render_replay",
    "grid_board_render_stale",
    "grid_board_request_key_conflict",
    "grid_picker_activity_accepted",
    "grid_picker_activity_replay",
    "grid_picker_exit_flush",
    "grid_picker_exit_no_queue",
    "grid_picker_stale_lease",
    "grid_board_scope_mismatch",
    "grid_board_disconnect_cleanup",
    "grid_board_input_invalid",
  ]);

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function cleanText(value, max) {
    if (typeof value !== "string" && typeof value !== "number") return "";
    const text = String(value).trim();
    return text && text.length <= max ? text : "";
  }

  function positiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) &&
        value >= 1
      ? value
      : null;
  }

  function normalizeIdentity(raw) {
    const source = isObject(raw) && isObject(raw.identity) ? raw.identity : raw;
    if (!isObject(source)) return null;
    const identity = {
      campaignId: cleanText(source.campaignId ?? source.campaign_id, 200),
      encounterId: cleanText(source.encounterId ?? source.encounter_id, 200),
      roundId: cleanText(source.roundId ?? source.round_id, 200),
      groupNo: cleanText(source.groupNo ?? source.group_no, 40),
      gridId: cleanText(source.gridId ?? source.grid_id, 200),
      gridRevision: cleanText(
        source.gridRevision ?? source.grid_revision ?? source.revision,
        240,
      ),
    };
    if (IDENTITY_FIELDS.some((field) => !identity[field])) return null;
    return Object.freeze(identity);
  }

  function sameIdentity(left, right) {
    const a = normalizeIdentity(left);
    const b = normalizeIdentity(right);
    return !!a && !!b &&
      IDENTITY_FIELDS.every((field) => a[field] === b[field]);
  }

  function sameScope(identity, scope) {
    return !!identity && !!scope && identity.campaignId === scope.campaignId &&
      identity.groupNo === scope.groupNo;
  }

  function normalizeScope(raw) {
    if (!isObject(raw)) return null;
    const campaignId = cleanText(raw.campaignId ?? raw.campaign_id, 200);
    const groupNo = cleanText(raw.groupNo ?? raw.group_no, 40);
    return campaignId && groupNo
      ? Object.freeze({ campaignId, groupNo })
      : null;
  }

  function normalizeRender(raw) {
    if (!isObject(raw)) return null;
    const identity = normalizeIdentity(raw.identity);
    const requestKey = cleanText(raw.requestKey ?? raw.request_key, 160);
    const sequence = positiveInteger(raw.sequence);
    const trigger = cleanText(raw.trigger, 40);
    if (
      !identity || !requestKey || sequence === null ||
      !RENDER_TRIGGERS.includes(trigger)
    ) return null;
    return Object.freeze({ identity, requestKey, sequence, trigger });
  }

  function result(eventCode, reasonCode, detail) {
    return Object.freeze({
      event_code: eventCode,
      reason_code: reasonCode,
      ...detail,
    });
  }

  function createController(rawScope) {
    const scope = normalizeScope(rawScope);
    if (!scope) throw new TypeError("grid-board-lease-scope-required");

    let generation = 0;
    let active = null;
    let queuedRender = null;
    let boardIdentity = null;
    let lastRender = null;
    let lastActivitySequence = 0;
    let flushCount = 0;

    function scopeMismatch() {
      return result("grid_board_render_gate", "grid_board_scope_mismatch", {
        kind: "noop",
      });
    }

    function invalidInput(eventCode) {
      return result(eventCode, "grid_board_input_invalid", { kind: "reject" });
    }

    function leaseView(lease) {
      return lease
        ? Object.freeze({
          leaseToken: lease.leaseToken,
          pickerId: lease.pickerId,
          identity: lease.identity,
        })
        : null;
    }

    function renderDisposition(render, previous) {
      if (!previous) return null;
      if (!sameIdentity(render.identity, previous.identity)) {
        return render.sequence <= previous.sequence ? "stale" : null;
      }
      if (render.requestKey === previous.requestKey) {
        return render.sequence === previous.sequence ? "replay" : "conflict";
      }
      if (render.sequence < previous.sequence) return "stale";
      if (render.sequence === previous.sequence) return "conflict";
      return null;
    }

    function enterPicker(raw) {
      if (!isObject(raw)) return invalidInput("grid_picker_lease");
      const identity = normalizeIdentity(raw.identity);
      const pickerId = cleanText(raw.pickerId ?? raw.picker_id, 120);
      if (!identity || !pickerId) return invalidInput("grid_picker_lease");
      if (!sameScope(identity, scope)) return scopeMismatch();

      if (
        active && active.pickerId === pickerId &&
        sameIdentity(active.identity, identity)
      ) {
        return result("grid_picker_lease", "grid_picker_enter_replay", {
          kind: "noop",
          lease: leaseView(active),
        });
      }

      const retired = active ? active.leaseToken : null;
      const identityChanged = !!active &&
        !sameIdentity(active.identity, identity);
      if (identityChanged) queuedRender = null;
      generation += 1;
      const lease = Object.freeze({
        leaseToken: `grid-picker-lease-${generation}`,
        pickerId,
        identity,
      });
      active = lease;
      boardIdentity = identity;
      lastActivitySequence = 0;
      return result(
        "grid_picker_lease",
        retired ? "grid_picker_lease_replaced" : "grid_picker_lease_acquired",
        {
          kind: retired ? "lease_replaced" : "lease_acquired",
          lease: leaseView(lease),
          retired_lease_token: retired,
          queued_render_retained: !!queuedRender,
        },
      );
    }

    function requestRender(raw) {
      const render = normalizeRender(raw);
      if (!render) return invalidInput("grid_board_render_gate");
      if (!sameScope(render.identity, scope)) return scopeMismatch();

      // The active picker defines which revision is currently protected. A
      // different authoritative identity must win even when its transport
      // sequence collides with a queued same-revision poll.
      if (active && !sameIdentity(active.identity, render.identity)) {
        const invalidatedLease = active.leaseToken;
        const droppedDeferred = !!queuedRender;
        active = null;
        queuedRender = null;
        lastActivitySequence = 0;
        boardIdentity = render.identity;
        lastRender = render;
        return result(
          "grid_board_render_gate",
          "grid_board_authoritative_revision",
          {
            kind: "invalidate_picker_and_render",
            invalidated_lease_token: invalidatedLease,
            dropped_deferred_render: droppedDeferred,
            request: render,
          },
        );
      }

      const queuedDisposition = renderDisposition(render, queuedRender);
      if (queuedDisposition === "replay" || queuedDisposition === "stale") {
        return result(
          "grid_board_render_gate",
          queuedDisposition === "replay"
            ? "grid_board_render_replay"
            : "grid_board_render_stale",
          { kind: "noop" },
        );
      }
      if (queuedDisposition === "conflict") {
        return result(
          "grid_board_render_gate",
          "grid_board_request_key_conflict",
          { kind: "reject" },
        );
      }

      const lastDisposition = renderDisposition(render, lastRender);
      if (lastDisposition === "replay" || lastDisposition === "stale") {
        return result(
          "grid_board_render_gate",
          lastDisposition === "replay"
            ? "grid_board_render_replay"
            : "grid_board_render_stale",
          { kind: "noop" },
        );
      }
      if (lastDisposition === "conflict") {
        return result(
          "grid_board_render_gate",
          "grid_board_request_key_conflict",
          { kind: "reject" },
        );
      }

      if (active && sameIdentity(active.identity, render.identity)) {
        const coalesced = !!queuedRender;
        queuedRender = render;
        return result(
          "grid_board_render_gate",
          coalesced
            ? "grid_board_same_revision_coalesced"
            : "grid_board_same_revision_deferred",
          {
            kind: "defer_render",
            coalesced,
            queue_depth: 1,
            request: render,
          },
        );
      }

      queuedRender = null;
      boardIdentity = render.identity;
      lastRender = render;
      return result("grid_board_render_gate", "grid_board_render_no_picker", {
        kind: "permit_render",
        request: render,
      });
    }

    function pickerActivity(raw) {
      if (!isObject(raw)) return invalidInput("grid_picker_activity");
      const identity = normalizeIdentity(raw.identity);
      const leaseToken = cleanText(raw.leaseToken ?? raw.lease_token, 160);
      const activityCode = cleanText(raw.activityCode ?? raw.activity_code, 40);
      const sequence = positiveInteger(raw.sequence);
      if (
        !identity || !leaseToken || sequence === null ||
        !ACTIVITY_CODES.includes(activityCode)
      ) return invalidInput("grid_picker_activity");
      if (!sameScope(identity, scope)) return scopeMismatch();
      if (
        !active || active.leaseToken !== leaseToken ||
        !sameIdentity(active.identity, identity)
      ) {
        return result("grid_picker_activity", "grid_picker_stale_lease", {
          kind: "noop",
        });
      }
      if (sequence <= lastActivitySequence) {
        return result("grid_picker_activity", "grid_picker_activity_replay", {
          kind: "noop",
        });
      }
      lastActivitySequence = sequence;
      return result("grid_picker_activity", "grid_picker_activity_accepted", {
        kind: "activity_accepted",
        activity_code: activityCode,
        sequence,
        queue_depth: queuedRender ? 1 : 0,
      });
    }

    function exitPicker(raw) {
      if (!isObject(raw)) return invalidInput("grid_picker_exit");
      const identity = normalizeIdentity(raw.identity);
      const leaseToken = cleanText(raw.leaseToken ?? raw.lease_token, 160);
      const exitReason = cleanText(raw.exitReason ?? raw.exit_reason, 40);
      if (!identity || !leaseToken || !EXIT_REASONS.includes(exitReason)) {
        return invalidInput("grid_picker_exit");
      }
      if (!sameScope(identity, scope)) return scopeMismatch();
      if (
        !active || active.leaseToken !== leaseToken ||
        !sameIdentity(active.identity, identity)
      ) {
        return result("grid_picker_exit", "grid_picker_stale_lease", {
          kind: "noop",
        });
      }

      active = null;
      lastActivitySequence = 0;
      if (!queuedRender) {
        return result("grid_picker_exit", "grid_picker_exit_no_queue", {
          kind: "picker_released",
          exit_reason: exitReason,
        });
      }

      const render = queuedRender;
      queuedRender = null;
      boardIdentity = render.identity;
      lastRender = render;
      flushCount += 1;
      return result("grid_picker_exit", "grid_picker_exit_flush", {
        kind: "flush_queued_render",
        exit_reason: exitReason,
        request: render,
        flush_count: flushCount,
      });
    }

    function disconnect() {
      const droppedDeferred = !!queuedRender;
      const retiredLease = active ? active.leaseToken : null;
      active = null;
      queuedRender = null;
      boardIdentity = null;
      lastActivitySequence = 0;
      return result(
        "grid_board_cleanup",
        "grid_board_disconnect_cleanup",
        {
          kind: "cleanup_complete",
          retired_lease_token: retiredLease,
          dropped_deferred_render: droppedDeferred,
        },
      );
    }

    function state() {
      return Object.freeze({
        phase: active ? "picker_active" : "idle",
        scope,
        activeLease: leaseView(active),
        boardIdentity,
        queuedRender,
        queueDepth: queuedRender ? 1 : 0,
        lastRender,
        lastActivitySequence,
        flushCount,
      });
    }

    return Object.freeze({
      enterPicker,
      requestRender,
      pickerActivity,
      exitPicker,
      disconnect,
      state,
    });
  }

  root.TTRPG_GRID_BOARD_REPLACEMENT_LEASE = Object.freeze({
    build: BUILD,
    identityFields: IDENTITY_FIELDS,
    renderTriggers: RENDER_TRIGGERS,
    activityCodes: ACTIVITY_CODES,
    exitReasons: EXIT_REASONS,
    eventCodes: EVENT_CODES,
    reasonCodes: REASON_CODES,
    normalizeIdentity,
    sameIdentity,
    create: createController,
  });
})(globalThis);
