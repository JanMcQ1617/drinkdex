import { AuthGate } from '@/components/AuthGate';
import { FriendsBoard } from '@/components/tournaments/FriendsBoard';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* The Tournaments tab (v4.7, specs/v4.7/spec.md 2)                     */
/*                                                                      */
/* The page behind the red trophy key in the middle of the bar: running */
/* tournaments on top, and the Friends board under them (components/    */
/* tournaments/FriendsBoard). Its route is `board`, at /board, never    */
/* /tournaments, which is the pushed full list and its children; a tab  */
/* at the same path would collide with them (lib/tournaments' boardHref). */
/*                                                                      */
/* Behind the AuthGate, as Profile's body is: tournaments and the       */
/* Friends board are both an account's, and signed out the server's    */
/* functions are not callable. Keyed on the user id, so a switch of     */
/* account remounts the board instead of showing the last one's table   */
/* for a frame (both stores also reset themselves on the switch).       */
/* ==================================================================== */

function Board() {
  const myId = useAuth((s) => s.session?.user.id);
  if (!myId) return null;
  return <FriendsBoard key={myId} myId={myId} />;
}

export default function BoardTab() {
  return (
    <AuthGate>
      <Board />
    </AuthGate>
  );
}
