/* Aviso flotante reutilizable. Vive en su propio módulo para que auth,
   panel, mapa y admin lo compartan sin puentes por window. */
let toastT;

export function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove('show'), 3000);
}
