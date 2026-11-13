/**
 * Consentimiento de registro (todo 15): columnas aditivas de la migración 003.
 *
 * `CONSENT_STRICT=0` (default) mantiene el comportamiento retrocompatible:
 * sin los tres booleanos, las columnas quedan NULL. Cuando llegan los tres
 * en `true`, se persisten versión, fecha y edad. `CONSENT_STRICT=1` los exige.
 */
export const CONSENT_VERSION = '2026-10';

export const CONSENT_REQUIRED_MESSAGE = 'Para registrarte necesitás aceptar los términos y la política de privacidad, y confirmar que tenés edad suficiente.';

export type ConsentInput = Readonly<{
    acceptTerms: boolean;
    acceptPrivacy: boolean;
    ageConfirmed: boolean;
}>;

export function hasFullConsent(consent: ConsentInput): boolean {
    return consent.acceptTerms && consent.acceptPrivacy && consent.ageConfirmed;
}
