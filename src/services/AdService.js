/**
 * AdService — gestiona la publicidad en Bachacos.
 *
 * - En plataformas nativas (Android/iOS via Capacitor): usa AdMob con IDs de prueba.
 * - En web/PC: el banner HTML del index.html es suficiente; no hace nada extra.
 *
 * IDs de prueba de Google AdMob (no generan ingresos reales):
 *   App ID Android : ca-app-pub-3940256099942544~3347511713
 *   Banner unit ID : ca-app-pub-3940256099942544/6300978111
 */

const ADMOB_BANNER_ID_ANDROID = 'ca-app-pub-3940256099942544/6300978111';
// Reemplaza estos IDs por los reales cuando tengas cuenta AdMob
const ADMOB_APP_ID_ANDROID    = 'ca-app-pub-3940256099942544~3347511713';

let admobReady = false;

/** Detecta si se ejecuta en plataforma nativa Capacitor. */
function isNative() {
    return !!(
        typeof window !== 'undefined' &&
        window.Capacitor &&
        window.Capacitor.isNativePlatform()
    );
}

/**
 * Inicializa AdMob en plataforma nativa y muestra el banner de prueba.
 * En web no hace nada (el banner HTML ya está en index.html).
 */
export async function initAds() {
    if (!isNative()) {
        // Web/PC: el banner HTML de index.html es visible automáticamente.
        return;
    }
    try {
        const { AdMob, BannerAdSize, BannerAdPosition } = await import('@capacitor-community/admob');

        await AdMob.initialize({
            testingDevices: [],   // deja vacío para modo prueba global (isTesting: true)
            initializeForTesting: true,
        });

        const options = {
            adId: ADMOB_BANNER_ID_ANDROID,
            adSize: BannerAdSize.ADAPTIVE_BANNER,
            position: BannerAdPosition.BOTTOM_CENTER,
            margin: 0,
            isTesting: true,
        };

        await AdMob.showBanner(options);
        admobReady = true;
        console.log('[AdService] Banner AdMob mostrado (modo prueba).');
    } catch (err) {
        console.warn('[AdService] No se pudo inicializar AdMob:', err);
    }
}

/** Oculta el banner AdMob (útil si navegas a pantallas sin juego). */
export async function hideAds() {
    if (!isNative() || !admobReady) return;
    try {
        const { AdMob } = await import('@capacitor-community/admob');
        await AdMob.hideBanner();
    } catch (err) {
        console.warn('[AdService] Error al ocultar banner:', err);
    }
}

/** Vuelve a mostrar el banner AdMob si fue ocultado. */
export async function showAds() {
    if (!isNative() || !admobReady) return;
    try {
        const { AdMob } = await import('@capacitor-community/admob');
        await AdMob.resumeBanner();
    } catch (err) {
        console.warn('[AdService] Error al reanudar banner:', err);
    }
}
