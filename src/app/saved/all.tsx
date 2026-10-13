import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';

import { AuthGate } from '@/components/AuthGate';
import { AllSavedPage } from '@/components/collections/AllSaved';
import { useAuth } from '@/store/auth';

/* ==================================================================== */
/* All saved (spec §4.5)                                                */
/*                                                                      */
/* What the Saved tab showed until v4.2, moved unchanged: the saved     */
/* drinks two-up, then the saved posts not in your Dex yet, then those  */
/* already in it (components/collections/AllSaved, which the tab still  */
/* draws itself while collections are off). Pushed from the All saved   */
/* tile, under a back chevron.                                          */
/*                                                                      */
/* Signed in, behind the gate and keyed by account, as the tab is. The   */
/* tile only shows signed in; a link that lands here signed out shows    */
/* the phone's saved drinks, as the tab does.                           */
/* ==================================================================== */

export default function AllSavedScreen() {
  const router = useRouter();
  const myId = useAuth((s) => s.session?.user.id ?? null);

  /* Back is the stack's; opened with nothing under it, the Saved tab. */
  const leave = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace('/saved');
  }, [router]);

  if (myId) {
    return (
      <AuthGate onClose={leave}>
        <AllSavedPage key={myId} myId={myId} onBack={leave} />
      </AuthGate>
    );
  }
  return <AllSavedPage myId={null} onBack={leave} />;
}
