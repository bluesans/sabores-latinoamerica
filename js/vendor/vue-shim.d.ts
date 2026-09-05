// Tipado mínimo del runtime global de Vue: llega como script clásico versionado
// (js/vendor/vue.global.prod.js), sin bundler ni tipos oficiales en el repo.
export interface VueApp {
    mount: (selector: string) => void;
    unmount: () => void;
}
export interface VueGlobal {
    createApp: (root: unknown) => VueApp;
    ref?: <T>(initial: T) => { value: T };
    reactive?: <T extends object>(initial: T) => T;
}
declare global {
    interface Window {
        Vue?: VueGlobal;
    }
}
export {};
