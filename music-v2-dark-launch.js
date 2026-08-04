// Music v2 Gate 6 canary client. Loaded in every page but active only when the
// host explicitly sets this campaign's wall mode to "enforce".
// language-impact: th+en — every player-visible recovery message is paired.
(function (root) {
  'use strict';

  const COPY = Object.freeze({
    autoplay: Object.freeze({
      th: '🔊 แตะหน้าจอหนึ่งครั้งเพื่อเปิดเพลงประกอบ',
      en: '🔊 Tap once to enable background music.',
    }),
    degraded: Object.freeze({
      th: '(แก้: เพลงใหม่เล่นไม่ได้ชั่วคราว ระบบจึงใช้เพลงบรรยากาศเดิมในอุปกรณ์นี้)',
      en: '(Fixed: new music is temporarily unavailable, so this device is using the legacy ambience.)',
    }),
    silent: Object.freeze({
      th: '(แก้: ยังไม่มีเพลงที่ผ่านเงื่อนไขสำหรับฉากนี้ ระบบจะลองใหม่เมื่อสถานะเปลี่ยน)',
      en: '(Fixed: no eligible track is available for this scene yet; the system will retry after state changes.)',
    }),
  });

  function text(language, key) {
    const pair = COPY[key] || COPY.degraded;
    return language === 'en' ? pair.en : pair.th;
  }

  function enabled(settings) {
    return String(settings && settings.wall_modes && settings.wall_modes.music_v2 || '').toLowerCase() === 'enforce';
  }

  function selectEncoding(assets, canPlayType) {
    const rows = Array.isArray(assets) ? assets.slice() : [];
    const playable = rows.filter(function (asset) {
      try { return !!canPlayType(String(asset.mime_type || '')); } catch (_) { return false; }
    });
    playable.sort(function (a, b) {
      const ap = a.profile_id === 'webm-opus-112' ? 0 : a.profile_id === 'mp3-160' ? 1 : 2;
      const bp = b.profile_id === 'webm-opus-112' ? 0 : b.profile_id === 'mp3-160' ? 1 : 2;
      return ap - bp || String(a.asset_key).localeCompare(String(b.asset_key));
    });
    return playable[0] || null;
  }

  function mediaErrorCode(value) {
    const code = Number(value && value.code || value || 0);
    return code === 1 ? 'aborted' : code === 2 ? 'network' : code === 3 ? 'decode' : code === 4 ? 'not_supported' : 'unknown';
  }

  function storageKey(context) {
    return 'ttrpg_music_v2_resume_' + String(context.campaignId || 'x') + '_g' + String(context.groupNo || 1);
  }

  function createPlayer(options) {
    const createAudio = options.createAudio || function () { return new Audio(); };
    const setTimer = options.setInterval || root.setInterval.bind(root);
    const clearTimer = options.clearInterval || root.clearInterval.bind(root);
    const setDeadline = options.setTimeout || root.setTimeout.bind(root);
    const clearDeadline = options.clearTimeout || root.clearTimeout.bind(root);
    const store = options.storage || null;
    const fadeMs = Math.max(0, Number(options.fadeMs == null ? 800 : options.fadeMs));
    const mediaStartTimeoutMs = Math.max(1, Number(options.mediaStartTimeoutMs == null ? 12000 : options.mediaStartTimeoutMs));
    const context = options.context || {};
    let slots = null;
    let active = -1;
    let current = null;
    let suspended = false;
    let volume = Math.max(0, Math.min(1, Number(options.volume == null ? 0.5 : options.volume)));
    let fadeTimer = null;
    let mediaStartTimer = null;
    let mediaStartElement = null;
    const reported = new Set();
    const started = new Set();

    function persist() {
      if (!store || !current || active < 0) return;
      try {
        store.setItem(storageKey(context), JSON.stringify({
          track_key: current.trackKey,
          epoch: current.epoch,
          position: Math.max(0, Number(slots[active].currentTime) || 0),
          saved_at: Date.now(),
        }));
      } catch (_) {}
    }

    function restorePosition(el, selection) {
      if (!store) return;
      try {
        const saved = JSON.parse(store.getItem(storageKey(context)) || 'null');
        if (!saved || saved.track_key !== selection.trackKey || Number(saved.epoch) !== Number(selection.epoch)) return;
        if (Date.now() - Number(saved.saved_at || 0) > 15 * 60 * 1000) return;
        const position = Math.max(0, Number(saved.position) || 0);
        if (position <= 0) return;
        const apply = function () {
          try {
            const duration = Number(el.duration);
            el.currentTime = Number.isFinite(duration) && duration > 0 ? Math.min(position, Math.max(0, duration - 0.25)) : position;
          } catch (_) {}
        };
        apply();
        if (el.addEventListener) el.addEventListener('loadedmetadata', apply, { once: true });
      } catch (_) {}
    }

    function clearMediaStartTimeout(el) {
      if (el && mediaStartElement !== el) return;
      if (mediaStartTimer !== null) clearDeadline(mediaStartTimer);
      mediaStartTimer = null;
      mediaStartElement = null;
    }

    function notifyFailure(el, forcedCode) {
      if (!current || slots[active] !== el) return;
      clearMediaStartTimeout(el);
      const code = forcedCode || mediaErrorCode(el.error);
      const key = current.trackKey + '|' + current.epoch + '|' + current.asset.asset_key;
      if (reported.has(key)) return;
      reported.add(key);
      try { el.pause(); } catch (_) {}
      const exposure = {
        schema: 'music_v2_playback_exposure_v1',
        playback_exposures: { numerator: 1, denominator: 1 },
        playback_started: { numerator: 0, denominator: 1 },
        playback_start_unreported: { numerator: code === 'timeout' ? 1 : 0, denominator: 1 },
      };
      if (options.onPlaybackExposure) options.onPlaybackExposure(exposure);
      if (options.onError) options.onError({
        group: Number(context.groupNo || 1),
        epoch: Number(current.epoch),
        selected_track: current.trackKey,
        encoded_asset: current.asset.asset_key,
        error_code: code,
        exposure: exposure,
      });
    }

    function notifyStarted(el) {
      if (!current || slots[active] !== el) return;
      clearMediaStartTimeout(el);
      const key = current.trackKey + '|' + current.epoch + '|' + current.asset.asset_key;
      if (started.has(key)) return;
      started.add(key);
      const exposure = {
        schema: 'music_v2_playback_exposure_v1',
        playback_exposures: { numerator: 1, denominator: 1 },
        playback_started: { numerator: 1, denominator: 1 },
        playback_start_unreported: { numerator: 0, denominator: 1 },
      };
      if (options.onPlaybackExposure) options.onPlaybackExposure(exposure);
      if (options.onPlaybackStarted) options.onPlaybackStarted({
        group_no: Number(context.groupNo || 1),
        selected_origin: current.origin,
        selected_track_key: current.trackKey,
        selected_rotation_epoch: current.epoch,
        selected_catalog_version: current.catalogVersion,
        observed_state_version: current.observedStateVersion,
        exposure: exposure,
      });
    }

    // MUSIC_V2_MEDIA_NO_EVENT_TIMEOUT_START: a play() promise may resolve while
    // the media element emits no playing/error/ended event. Bound that exposure.
    function armMediaStartTimeout(el) {
      clearMediaStartTimeout();
      mediaStartElement = el;
      mediaStartTimer = setDeadline(function () {
        mediaStartTimer = null;
        mediaStartElement = null;
        notifyFailure(el, 'timeout');
      }, mediaStartTimeoutMs);
    }
    // MUSIC_V2_MEDIA_NO_EVENT_TIMEOUT_END

    function ensureSlots() {
      if (slots) return slots;
      slots = [createAudio(), createAudio()];
      slots.forEach(function (el) {
        el.preload = 'metadata';
        if (el.addEventListener) {
          el.addEventListener('playing', function () { notifyStarted(el); });
          el.addEventListener('ended', function () { clearMediaStartTimeout(el); });
          el.addEventListener('error', function () { notifyFailure(el); });
          el.addEventListener('timeupdate', persist);
        }
      });
      return slots;
    }

    function handlePlayRejection(el, error) {
      if (error && error.name === 'NotAllowedError') {
        clearMediaStartTimeout(el);
        if (options.onAutoplayBlocked) options.onAutoplayBlocked();
        return;
      }
      notifyFailure(el);
    }

    function playElement(el) {
      armMediaStartTimeout(el);
      try {
        const promise = el.play();
        if (promise && promise.catch) promise.catch(function (error) { handlePlayRejection(el, error); });
      } catch (error) { handlePlayRejection(el, error); }
    }

    function crossfade(outgoing, incoming) {
      if (fadeTimer) { clearTimer(fadeTimer); fadeTimer = null; }
      const target = volume;
      try { incoming.volume = 0; } catch (_) {}
      if (!outgoing || fadeMs === 0) {
        try { incoming.volume = target; } catch (_) {}
        if (outgoing) { try { outgoing.pause(); } catch (_) {} }
        return;
      }
      const steps = 12;
      let step = 0;
      const outgoingStart = Math.max(0, Number(outgoing.volume) || 0);
      fadeTimer = setTimer(function () {
        step += 1;
        const ratio = Math.min(1, step / steps);
        try { incoming.volume = target * ratio; } catch (_) {}
        try { outgoing.volume = outgoingStart * (1 - ratio); } catch (_) {}
        if (step >= steps) {
          clearTimer(fadeTimer);
          fadeTimer = null;
          try { outgoing.pause(); } catch (_) {}
        }
      }, Math.max(1, fadeMs / steps));
    }

    function play(selection) {
      const elements = ensureSlots();
      const asset = selectEncoding(selection.assets, function (mime) { return elements[0].canPlayType(mime); });
      if (!asset) return { ok: false, reason: 'no_supported_encoding' };
      if (current && current.trackKey === selection.trackKey && Number(current.epoch) === Number(selection.epoch)) {
        if (!suspended && elements[active].paused) playElement(elements[active]);
        return { ok: true, reused: true, asset: current.asset };
      }
      persist();
      const previous = active >= 0 ? elements[active] : null;
      const next = active === 0 ? 1 : 0;
      const incoming = elements[next];
      active = next;
      current = {
        trackKey: selection.trackKey,
        epoch: Number(selection.epoch),
        origin: selection.origin,
        catalogVersion: selection.catalogVersion == null ? null : selection.catalogVersion,
        observedStateVersion: selection.observedStateVersion || null,
        asset: asset,
      };
      suspended = false;
      incoming.loop = asset.loop_enabled !== false;
      if (incoming.src !== asset.url) incoming.src = asset.url;
      restorePosition(incoming, selection);
      playElement(incoming);
      crossfade(previous, incoming);
      return { ok: true, reused: false, asset: asset };
    }

    function suspend() {
      suspended = true;
      clearMediaStartTimeout();
      persist();
      if (slots && active >= 0) { try { slots[active].pause(); } catch (_) {} }
    }

    function resume() {
      suspended = false;
      if (slots && active >= 0 && slots[active].paused) playElement(slots[active]);
    }

    function pause() {
      clearMediaStartTimeout();
      persist();
      if (slots) slots.forEach(function (el) { try { el.pause(); } catch (_) {} });
    }

    function setVolume(next) {
      volume = Math.max(0, Math.min(1, Number(next) || 0));
      if (slots && active >= 0 && !fadeTimer) {
        try { slots[active].volume = volume; } catch (_) {}
      }
    }

    return { play, suspend, resume, pause, setVolume, current: function () { return current; } };
  }

  function createDarkLaunchController(options) {
    let player = null;
    let refreshSequence = 0;
    const reportTimeoutMs = Math.max(1, Number(options.reportTimeoutMs == null ? 2500 : options.reportTimeoutMs));
    const setDeadline = options.setTimeout || root.setTimeout.bind(root);
    const clearDeadline = options.clearTimeout || root.clearTimeout.bind(root);

    function context() { return options.getContext(); }
    function isEnabled() { const ctx = context(); return enabled(ctx.settings); }
    function ensurePlayer(ctx) {
      if (!player) player = createPlayer({
        context: { campaignId: ctx.campaignId, groupNo: ctx.groupNo },
        volume: ctx.volume,
        storage: options.storage || root.sessionStorage,
        createAudio: options.createAudio,
        mediaStartTimeoutMs: options.mediaStartTimeoutMs,
        setTimeout: options.setTimeout,
        clearTimeout: options.clearTimeout,
        onAutoplayBlocked: function () { options.onVisible(text(ctx.language, 'autoplay')); },
        onPlaybackExposure: options.onPlaybackExposure,
        onPlaybackStarted: options.onPlaybackStarted,
        onError: reportError,
      });
      player.setVolume(ctx.volume);
      return player;
    }

    function publicUrl(ctx, path) {
      return String(ctx.publicBase).replace(/\/+$/u, '') + '/audio/' + String(path).split('/').map(encodeURIComponent).join('/');
    }

    async function selectedAssets(ctx, state) {
      if (state.selected_origin === 'official') {
        const result = await ctx.supabase.from('music_v2_official_candidates')
          .select('asset_key,profile_id,mime_type,object_path,loop_enabled,loop_start_seconds,loop_end_seconds,loop_crossfade_ms')
          .eq('track_key', state.selected_track_key)
          .eq('catalog_version', state.selected_catalog_version);
        if (result.error) throw result.error;
        return (result.data || []).map(function (row) { return Object.assign({}, row, { url: publicUrl(ctx, row.object_path) }); });
      }
      if (state.selected_origin === 'campaign') {
        const id = String(state.selected_track_key || '').replace(/^campaign:/u, '');
        const result = await ctx.supabase.from('music_tracks')
          .select('id,storage_path,loop,volume,mood')
          .eq('campaign_id', ctx.campaignId).eq('id', id).neq('mood', 'perform').maybeSingle();
        if (result.error || !result.data) throw result.error || new Error('campaign_track_missing');
        return [{
          asset_key: 'campaign:' + result.data.id,
          profile_id: 'campaign-original',
          mime_type: String(result.data.storage_path || '').toLowerCase().endsWith('.webm') ? 'audio/webm' : 'audio/mpeg',
          url: publicUrl(ctx, result.data.storage_path),
          loop_enabled: result.data.loop !== false,
        }];
      }
      const builtin = options.builtinAsset(state.selected_track_key);
      return builtin ? [builtin] : [];
    }

    async function refresh() {
      const ctx = context();
      if (!enabled(ctx.settings)) return false;
      const sequence = ++refreshSequence;
      try {
        const result = await ctx.supabase.from('music_v2_group_projection')
          .select('campaign_id,group_no,rotation_epoch,selection_status,selected_origin,selected_track_key,selected_catalog_version')
          .eq('campaign_id', ctx.campaignId).eq('group_no', ctx.groupNo).maybeSingle();
        if (result.error) throw result.error;
        if (sequence !== refreshSequence) return true;
        const state = result.data;
        if (!state || state.selection_status !== 'selected' || !state.selected_track_key) {
          if (player) player.pause();
          options.onDegraded(ctx.mood, text(ctx.language, 'silent'));
          return true;
        }
        const assets = await selectedAssets(ctx, state);
        if (sequence !== refreshSequence) return true;
        const verdict = ensurePlayer(ctx).play({
          trackKey: state.selected_track_key,
          epoch: state.rotation_epoch,
          origin: state.selected_origin,
          catalogVersion: state.selected_catalog_version,
          observedStateVersion: ctx.stateVersion,
          assets: assets,
        });
        if (!verdict.ok) {
          if (player) player.pause();
          options.onDegraded(ctx.mood, text(ctx.language, 'degraded'));
        }
      } catch (_) {
        if (player) player.pause();
        options.onDegraded(ctx.mood, text(ctx.language, 'degraded'));
      }
      return true;
    }

    async function reportError(error) {
      const ctx = context();
      if (player) player.pause();
      options.onDegraded(ctx.mood, text(ctx.language, 'degraded'));
      let reportTimer = null;
      let timedOut = false;
      const abortController = new (options.AbortController || root.AbortController)();
      try {
        // MUSIC_V2_REPORT_TIMEOUT_WALL_START: race the complete authenticated
        // report against a local deadline; AbortController alone is not enough
        // because a transport double may ignore its signal.
        const send = (async function () {
          const session = await ctx.supabase.auth.getSession();
          const token = session && session.data && session.data.session && session.data.session.access_token;
          if (!token) throw new Error('music_auth_missing');
          const response = await (options.fetcher || root.fetch)(ctx.resolveUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({
              campaign_id: ctx.campaignId,
              group_no: ctx.groupNo,
              client_build: ctx.frontendBuild,
              client_epoch: ctx.frontendEpoch,
              i18n_asset_build: ctx.i18nAssetBuild,
              music_playback_error: {
                expected_epoch: error.epoch,
                selected_track_key: error.selected_track,
                encoded_asset_key: error.encoded_asset,
                error_code: error.error_code,
              },
            }),
            signal: abortController.signal,
          });
          const body = await response.json();
          if (!response.ok) throw new Error(String(body && body.error || response.status));
          return body;
        })();
        const timeout = new Promise(function (_, reject) {
          reportTimer = setDeadline(function () {
            timedOut = true;
            abortController.abort();
            reject(new Error('music_report_timeout'));
          }, reportTimeoutMs);
        });
        const body = await Promise.race([send, timeout]);
        const note = ctx.language === 'en' ? body.player_note_en : body.player_note_th;
        if (note) options.onVisible(note);
        if (options.onReportOutcome) options.onReportOutcome({
          schema: 'music_v2_report_transport_v1',
          status: 'reported',
          error_code: error.error_code,
          report_attempts: { numerator: 1, denominator: 1 },
          report_completed: { numerator: 1, denominator: 1 },
          report_timeouts: { numerator: 0, denominator: 1 },
        });
      } catch (_) {
        options.onVisible(text(ctx.language, 'degraded'));
        if (options.onReportOutcome) options.onReportOutcome({
          schema: 'music_v2_report_transport_v1',
          status: timedOut ? 'timeout' : 'failed',
          error_code: error.error_code,
          report_attempts: { numerator: 1, denominator: 1 },
          report_completed: { numerator: 0, denominator: 1 },
          report_timeouts: { numerator: timedOut ? 1 : 0, denominator: 1 },
        });
      } finally {
        if (reportTimer !== null) clearDeadline(reportTimer);
      }
      // MUSIC_V2_REPORT_TIMEOUT_WALL_END
    }

    return {
      enabled: isEnabled,
      refresh: refresh,
      suspendForPerformance: function () { if (player) player.suspend(); },
      resumeAfterPerformance: function () { if (player) player.resume(); },
      pause: function () { if (player) player.pause(); },
      setVolume: function (value) { if (player) player.setVolume(value); },
    };
  }

  root.TTRPG_MUSIC_V2 = Object.freeze({
    COPY: COPY,
    text: text,
    enabled: enabled,
    selectEncoding: selectEncoding,
    mediaErrorCode: mediaErrorCode,
    createPlayer: createPlayer,
    createDarkLaunchController: createDarkLaunchController,
  });
})(globalThis);
