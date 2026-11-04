import { createRequire } from 'node:module';

/**
 * @golevelup/nestjs-stripe constructs the client with `new Stripe.default(...)`.
 * Stripe SDK v22+ only exports the constructor as `module.exports`, so we add
 * a default alias for CommonJS interop before Nest loads the Stripe module.
 */
const nodeRequire = createRequire(__filename);
const StripeSdk = nodeRequire('stripe') as typeof import('stripe') & {
  default?: typeof import('stripe');
};

if (typeof StripeSdk === 'function' && StripeSdk.default === undefined) {
  (StripeSdk as { default: typeof StripeSdk }).default = StripeSdk;
}
