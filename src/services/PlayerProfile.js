/**
 * PlayerProfile — guarda y carga el progreso del jugador en localStorage.
 * Compatible con web y Capacitor (localStorage está disponible en ambos).
 */

const PROFILE_KEY = 'bachacos_profile';

const DEFAULT_PROFILE = {
    maxUnlockedLevel: 999,   // todos los niveles accesibles desde el inicio
};

/** Carga el perfil desde localStorage. Si no existe, devuelve el perfil por defecto. */
export function loadProfile() {
    try {
        const raw = localStorage.getItem(PROFILE_KEY);
        if (!raw) return { ...DEFAULT_PROFILE };
        return { ...DEFAULT_PROFILE, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULT_PROFILE };
    }
}

/** Guarda el perfil en localStorage. */
export function saveProfile(profile) {
    try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch (e) {
        console.warn('[PlayerProfile] No se pudo guardar el perfil:', e);
    }
}

/** Devuelve el id del nivel más alto desbloqueado. */
export function getMaxUnlockedLevel() {
    return loadProfile().maxUnlockedLevel;
}

/**
 * Desbloquea el nivel `levelId` si aún no estaba desbloqueado.
 * Se llama al ganar un nivel para habilitar el siguiente.
 */
export function unlockLevel(levelId) {
    const profile = loadProfile();
    if (levelId > profile.maxUnlockedLevel) {
        profile.maxUnlockedLevel = levelId;
        saveProfile(profile);
    }
}

/** Resetea el progreso (útil para pruebas). */
export function resetProfile() {
    localStorage.removeItem(PROFILE_KEY);
}
