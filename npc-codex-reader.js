// BEAST-CODEX-RESIDUE-01: shared browser reader wall for audit-only NPC rows.
// language-impact: none -- no user-facing copy; filters lifecycle/marker state.
(function(root){
  'use strict';
  const TERMINAL=new Set(['archived','merged','type_mismatch']);
  const ARCHIVE_MARKER=/\[v744\s+monster identity\s+[—-]\s+archived,\s*not deleted\]/iu;
  const statusOf=v=>String(v==null?'':v).trim().toLowerCase();
  const notesOf=v=>Array.isArray(v)?v:[v];
  const hasArchiveMarker=row=>notesOf(row&&row.notes).some(note=>ARCHIVE_MARKER.test(String(note==null?'':note)));
  const isLoadable=row=>!!row&&row.archived!==true&&!TERMINAL.has(statusOf(row.status))&&!hasArchiveMarker(row);
  root.TTRPG_NPC_CODEX_READER=Object.freeze({isLoadable,hasArchiveMarker});
})(globalThis);
