import * as Linking from 'expo-linking';
import { useEffect } from 'react';

import { MERCHANT_ID, shopPublishableKey, stripeSdk, URL_SCHEME } from '@/lib/shop';
import { isStripeReturn } from '@/lib/shopCore';

/* ==================================================================== */
/* Stripe, for Buy a bottle                                             */
/*                                                                      */
/* v4.11 (specs/v4.11/shop.md). Mounted by the root layout only while   */
/* the shop is on (EXPO_PUBLIC_SPIRIT_SHOP), and draws nothing unless   */
/* this build also has a test publishable key (lib/shop): with either   */
/* missing there is no StripeProvider at all, and Buy says checkout is  */
/* not set up.                                                          */
/*                                                                      */
/* BESIDE THE STACK, NOT ROUND IT. StripeProvider holds no context: it  */
/* runs initStripe in an effect and draws its children (checked in      */
/* @stripe/stripe-react-native 0.64.0), so it sits here with nothing    */
/* in it, as the other hosts in the root layout render nothing, and the */
/* navigator's tree is the same with the shop on or off.               */
/*                                                                      */
/* THE RETURN LINK. A payment method that leaves the app (a bank's own  */
/* page, another app) comes back on drinkdex://stripe-redirect, and     */
/* Stripe needs to be handed that link to finish the sheet. The router  */
/* never sees it as a screen (app/+native-intent). Only a running app   */
/* has a sheet waiting, so a cold start's link is not passed on.        */
/*                                                                      */
/* THE KEY BEFORE THE SDK. This renders with the root layout, at        */
/* launch, so it asks for the key first and loads the SDK only for a    */
/* build that has one: with .env's key still empty nothing of Stripe's  */
/* is evaluated at all, and lib/shop's stripeSdk() answers null rather  */
/* than crash in a binary that lacks the native module.                 */
/* ==================================================================== */

export function ShopHost() {
  const publishableKey = shopPublishableKey();
  const stripe = publishableKey ? stripeSdk() : null;

  useEffect(() => {
    if (!stripe || !publishableKey) return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (isStripeReturn(url)) stripe.handleURLCallback(url).catch(() => undefined);
    });
    return () => sub.remove();
  }, [stripe, publishableKey]);

  if (!stripe || !publishableKey) return null;
  const { StripeProvider } = stripe;
  return (
    <StripeProvider publishableKey={publishableKey} merchantIdentifier={MERCHANT_ID} urlScheme={URL_SCHEME}>
      <></>
    </StripeProvider>
  );
}
