// One runtime owner for every background-music HTMLMediaElement.
// Every legacy, Bard-performance, and Music v2 start must acquire this owner.
// language-impact: th+en -- interventions surface paired copy in the pages.
(function (root) {
  'use strict';

  // Bard performance and legacy ambience intentionally share the same media
  // element, so they share one owner identity. Music v2 owns its private slots.
  const OWNER_NAMES = Object.freeze(['legacy', 'preview', 'v2']);
  const OWNER_SET = new Set(OWNER_NAMES);

  function createPlaybackOwner(options) {
    options = options || {};
    const registrations = new Map();
    let generation = 0;
    let currentOwner = null;

    function validOwner(value) {
      const name = String(value || '');
      return OWNER_SET.has(name) ? name : null;
    }

    function playing(contract) {
      try { return !!(contract && contract.isPlaying && contract.isPlaying()); } catch (_) { return true; }
    }

    function register(owner, contract) {
      const name = validOwner(owner);
      if (!name || !contract || typeof contract.stop !== 'function' || typeof contract.isPlaying !== 'function') {
        throw new Error('music_playback_owner_registration_invalid');
      }
      registrations.set(name, contract);
      return function unregister() {
        if (registrations.get(name) === contract) registrations.delete(name);
      };
    }

    function notify(event) {
      try { if (typeof options.onIntervene === 'function') options.onIntervene(event); } catch (_) {}
    }

    function acquire(owner, reason) {
      const nextOwner = validOwner(owner);
      if (!nextOwner) throw new Error('music_playback_owner_invalid');
      generation += 1;
      const stoppedOwners = [];
      const blockedOwners = [];
      registrations.forEach(function (contract, otherOwner) {
        if (otherOwner === nextOwner) return;
        const wasPlaying = playing(contract);
        try { contract.stop(String(reason || 'owner_transition')); } catch (_) {}
        const stillPlaying = playing(contract);
        if (wasPlaying && !stillPlaying) stoppedOwners.push(otherOwner);
        if (stillPlaying) blockedOwners.push(otherOwner);
      });
      if (blockedOwners.length) {
        currentOwner = null;
        notify({
          schema: 'music_playback_owner_guard_v1',
          status: 'blocked',
          reason: String(reason || 'owner_transition'),
          previousOwners: blockedOwners,
          nextOwner: nextOwner,
          generation: generation,
        });
        return null;
      }
      currentOwner = nextOwner;
      const lease = Object.freeze({ owner: nextOwner, generation: generation });
      if (stoppedOwners.length) {
        notify({
          schema: 'music_playback_owner_guard_v1',
          status: 'prevented',
          reason: String(reason || 'owner_transition'),
          previousOwners: stoppedOwners,
          nextOwner: nextOwner,
          generation: generation,
        });
      }
      return lease;
    }

    function isCurrent(lease) {
      return !!lease && lease.owner === currentOwner && lease.generation === generation;
    }

    function stopAll(reason) {
      generation += 1;
      currentOwner = null;
      let blocked = false;
      registrations.forEach(function (contract) {
        try { contract.stop(String(reason || 'stop_all')); } catch (_) {}
        if (playing(contract)) blocked = true;
      });
      return !blocked;
    }

    function state() {
      return Object.freeze({ owner: currentOwner, generation: generation });
    }

    return Object.freeze({ register, acquire, isCurrent, stopAll, state });
  }

  root.TTRPG_MUSIC_PLAYBACK_OWNER = Object.freeze({
    OWNER_NAMES: OWNER_NAMES,
    createPlaybackOwner: createPlaybackOwner,
  });
})(globalThis);
