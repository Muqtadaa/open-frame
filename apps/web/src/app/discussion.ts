/**
 * What is said on a board, as the rest of the app sees it.
 *
 * A one-file seam over the adapter, the same shape as `remote-boards.ts` and
 * `identity.ts`. Two build failures meet here and this is what satisfies both:
 * `supabase-lives-only-in-adapters` forbids the UI from importing the client,
 * and `hooks-do-not-touch-adapters` forbids a hook from reaching past the
 * composition root for one. Without a seam, obeying the first means breaking
 * the second — which is exactly what happened.
 */
export {
  boardPeople,
  listComments,
  markMentionsRead,
  myMentions,
  postComment,
  resolveComment,
  watchMyMentions,
  type BoardComment,
  type BoardPerson,
  type Mention,
  type NewComment,
} from '../adapters/supabase/comments.js'
