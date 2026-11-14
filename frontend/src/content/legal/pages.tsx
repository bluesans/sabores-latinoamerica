import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { OWNER, REVIEW_NOTICE } from './owner';

export interface LegalPageContent {
  title: string;
  subtitle: string;
  body: ReactNode;
}

export const legalPages: Record<string, LegalPageContent> = {
  privacidad: {
    title: 'Política de privacidad',
    subtitle: 'Qué datos guardamos, para qué y cómo pedir su borrado.',
    body: (
      <>
        <section>
          <h2>1. Quién trata los datos</h2>
          <p>
            {OWNER.site} es un proyecto educativo sin fines de venta. El responsable del tratamiento
            es <strong>{OWNER.name}</strong>, con contacto en <strong>{OWNER.email}</strong>.
            Domicilio legal: <strong>{OWNER.address}</strong>. Jurisdicción prevista:{' '}
            <strong>{OWNER.jurisdiction}</strong>.
          </p>
        </section>
        <section>
          <h2>2. Datos que guardamos</h2>
          <ul>
            <li>
              <strong>Cuenta:</strong> nombre de usuario y hash bcrypt de la contraseña. Nunca
              guardamos la contraseña en texto plano.
            </li>
            <li>
              <strong>Sesiones:</strong> hash SHA-256 del token de refresco, fechas de
              creación/expiración, dirección IP y, al renovar la sesión, user-agent del navegador.
              La cookie de sesión es HttpOnly.
            </li>
            <li>
              <strong>Intentos de acceso:</strong> IP, nombre de usuario intentado, acción (login,
              registro, refresco o borrado) y fecha. Se usan para limitar abuso y se purgan a la
              hora.
            </li>
            <li>
              <strong>Favoritos:</strong> relación entre tu cuenta y las recetas que marcaste.
            </li>
            <li>
              <strong>Consentimiento:</strong> versión aceptada, fecha y confirmación de edad 13+.
              Los usuarios anteriores a la migración pueden tener estos campos vacíos.
            </li>
          </ul>
          <p>
            No hay analítica, publicidad ni perfiles comerciales. No pedimos nombre real, documento,
            teléfono ni dirección.
          </p>
        </section>
        <section>
          <h2>3. Para qué y con qué base</h2>
          <ul>
            <li>Crear y proteger tu cuenta, y mantener la sesión (ejecución del servicio).</li>
            <li>Prevenir abuso y fuerza bruta (seguridad del servicio).</li>
            <li>Guardar tus favoritos y preferencias (ejecución del servicio y consentimiento).</li>
            <li>Cargar videos de YouTube solo si aceptás terceros (consentimiento).</li>
          </ul>
        </section>
        <section>
          <h2>4. Retención</h2>
          <p>
            Las sesiones expiran a los 7 días o al cerrar sesión. Los intentos de acceso se purgan a
            la hora. La cuenta y los favoritos permanecen hasta que pidas el borrado. Podés eliminar
            la cuenta desde el menú de usuario; el borrado arrastra sesiones y favoritos.
          </p>
        </section>
        <section>
          <h2>5. Tus derechos</h2>
          <p>
            Podés solicitar acceso, rectificación o supresión escribiendo a{' '}
            <strong>{OWNER.email}</strong>. También podés eliminar la cuenta ahora mismo desde{' '}
            <Link to="/">la aplicación</Link> (menú «Mi cuenta»). Los plazos legales son de 10 días
            corridos para acceso y 5 días hábiles para rectificación o supresión (Ley 25.326).
          </p>
        </section>
        <section>
          <h2>6. Terceros</h2>
          <p>
            El mapa usa geometrías Natural Earth servidas localmente. Los videos se alojan en
            YouTube (Google LLC, Estados Unidos) y se cargan en modo{' '}
            <code>youtube-nocookie.com</code> únicamente después de tu consentimiento. Al
            reproducirlos, tu IP, user-agent y datos técnicos se transfieren a Google conforme a su
            política. Si rechazás terceros, no se hace ninguna petición a YouTube.
          </p>
        </section>
        <section>
          <h2>7. Seguridad</h2>
          <p>
            Usamos contraseñas con bcrypt, tokens de refresco hasheados, cookies
            HttpOnly/SameSite=Strict, límites de intentos y consultas preparadas. Ningún sistema es
            infalible: si detectás un problema, escribinos a <strong>{OWNER.email}</strong>.
          </p>
        </section>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Última actualización: {OWNER.updated}.
        </p>
      </>
    ),
  },
  terminos: {
    title: 'Términos de uso',
    subtitle: 'Reglas básicas para usar el atlas y su comunidad.',
    body: (
      <>
        <section>
          <h2>1. Servicio gratuito y educativo</h2>
          <p>
            {OWNER.site} es un atlas gastronómico informativo y gratuito. No vendemos recetas,
            cursos ni suscripciones, y no hay pagos dentro del sitio. El contenido se ofrece «tal
            cual», sin garantía de exactitud culinaria, nutricional o sanitaria.
          </p>
        </section>
        <section>
          <h2>2. Edad mínima</h2>
          <p>
            Para crear una cuenta necesitás confirmar que tenés 13 años o más. Si sos menor de edad
            en tu jurisdicción, usá el sitio con supervisión de tu madre, padre o tutor.
          </p>
        </section>
        <section>
          <h2>3. Uso aceptable</h2>
          <ul>
            <li>
              No intentes acceder a cuentas ajenas, eludir límites de intentos ni automatizar
              ataques.
            </li>
            <li>
              No publiques contenido ilegal, discriminatorio o que infrinja derechos de terceros.
            </li>
            <li>No uses el sitio para spam, scraping masivo o reventa de datos.</li>
            <li>
              Podemos suspender cuentas que abusen del servicio o pongan en riesgo a otras personas.
            </li>
          </ul>
        </section>
        <section>
          <h2>4. Cuenta y seguridad</h2>
          <p>
            Sos responsable de tu contraseña y de la actividad de tu cuenta. Podés cerrar sesión o
            eliminar la cuenta cuando quieras. Si sos la última persona administradora, el sistema
            bloquea el borrado para no dejar el panel sin acceso.
          </p>
        </section>
        <section>
          <h2>5. Contenido y propiedad intelectual</h2>
          <p>
            Las recetas son referencias culturales; las descripciones y el código del sitio
            pertenecen a sus autores. Las fuentes, Geometrías Natural Earth y librerías tienen sus
            propias licencias, detalladas en <Link to="/licencias">Licencias</Link>. No reclamamos
            propiedad sobre las tradiciones gastronómicas.
          </p>
        </section>
        <section>
          <h2>6. Enlaces externos</h2>
          <p>
            Los videos enlazan a YouTube. No controlamos ese servicio ni sus políticas; revisá sus
            términos y su privacidad antes de interactuar.
          </p>
        </section>
        <section>
          <h2>7. Cambios y contacto</h2>
          <p>
            Podemos actualizar estos términos por mejoras del servicio. La versión vigente queda
            publicada acá. Consultas: <strong>{OWNER.email}</strong>.
          </p>
        </section>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Última actualización: {OWNER.updated}.
        </p>
      </>
    ),
  },
  reembolsos: {
    title: 'Reembolsos',
    subtitle: 'El sitio es gratuito: no hay compras ni suscripciones.',
    body: (
      <>
        <section>
          <h2>1. Sin transacciones</h2>
          <p>
            {OWNER.site} no vende productos, no cobra suscripciones y no procesa pagos. Por lo tanto
            no hay reembolsos, cancelaciones ni facturación asociada al uso del atlas.
          </p>
        </section>
        <section>
          <h2>2. Si aparece un cobro</h2>
          <p>
            Si ves un cobro atribuido a este sitio, probablemente provenga de otro servicio o de un
            sitio homónimo. Escribinos a <strong>{OWNER.email}</strong> con el comprobante para que
            podamos orientarte y, si corresponde, denunciarlo.
          </p>
        </section>
        <section>
          <h2>3. Donaciones</h2>
          <p>
            Actualmente no hay donaciones ni botones de pago. Si en el futuro se incorporan, se
            documentarán acá con condiciones claras y sin cargos ocultos.
          </p>
        </section>
      </>
    ),
  },
  cookies: {
    title: 'Política de cookies',
    subtitle: 'Qué guardamos en tu navegador y cómo cambiarlo.',
    body: (
      <>
        <section>
          <h2>1. Categorías reales</h2>
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Finalidad</th>
                <th>Duración</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>sdl_refresh</code>
                </td>
                <td>Necesaria (cookie)</td>
                <td>Sesión: permite renovar el acceso sin guardar tokens en JavaScript.</td>
                <td>7 días o hasta cerrar sesión.</td>
              </tr>
              <tr>
                <td>
                  <code>sdl_consent</code>
                </td>
                <td>Funcional (localStorage)</td>
                <td>Recordar tu decisión sobre cookies y terceros.</td>
                <td>6 meses; después se vuelve a preguntar.</td>
              </tr>
              <tr>
                <td>
                  <code>sdl_topo_50m_v1</code>
                </td>
                <td>Funcional (localStorage)</td>
                <td>Cachear la geometría del mapa para no descargarla de nuevo.</td>
                <td>Hasta que borres los datos del sitio.</td>
              </tr>
              <tr>
                <td>
                  <code>youtube-nocookie.com</code>
                </td>
                <td>Terceros (solo con consentimiento)</td>
                <td>Reproducir el video de una receta cuando lo pedís.</td>
                <td>Según YouTube.</td>
              </tr>
            </tbody>
          </table>
          <p>
            No usamos cookies publicitarias, píxeles de seguimiento ni analítica. El mapa y las
            fuentes se sirven desde este sitio.
          </p>
        </section>
        <section>
          <h2>2. Cómo decidir</h2>
          <p>
            El aviso de cookies aparece en la primera visita y permite <strong>Rechazar</strong> o{' '}
            <strong>Aceptar todas</strong> con la misma prominencia. Rechazar no bloquea el sitio:
            solo impide cargar videos de terceros hasta que cambies de opinión.
          </p>
          <p>
            Podés reabrir las preferencias desde el enlace «Preferencias de cookies» del pie de
            página. También podés borrar el almacenamiento local del navegador para reiniciar la
            decisión.
          </p>
        </section>
        <section>
          <h2>3. Base y cambios</h2>
          <p>
            La cookie necesaria se apoya en la ejecución del servicio; las funcionales y de
            terceros, en tu consentimiento. Si cambiamos las categorías, actualizaremos la versión
            del consentimiento y volveremos a preguntar.
          </p>
        </section>
      </>
    ),
  },
  contacto: {
    title: 'Contacto',
    subtitle: 'Un correo directo, sin formularios que recolecten datos de más.',
    body: (
      <>
        <section>
          <h2>Escribinos</h2>
          <p>
            Para consultas sobre el proyecto, correcciones de recetas, privacidad o seguridad:{' '}
            <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a>.
          </p>
          <p>
            No hay formulario de contacto a propósito: no necesitamos recolectar más datos de los
            que ya describimos en la <Link to="/privacidad">política de privacidad</Link>.
          </p>
        </section>
        <section>
          <h2>Responsable</h2>
          <dl className="owner-data">
            <dt>Titular</dt>
            <dd>{OWNER.name}</dd>
            <dt>Correo</dt>
            <dd>{OWNER.email}</dd>
            <dt>Domicilio legal</dt>
            <dd>{OWNER.address}</dd>
            <dt>Jurisdicción</dt>
            <dd>{OWNER.jurisdiction}</dd>
          </dl>
        </section>
        <section>
          <h2>Antes de escribir</h2>
          <p>
            Si tu consulta es sobre el borrado de datos, podés resolverlo desde el menú «Mi cuenta»
            de la aplicación. Si es sobre cookies o videos, revisá la{' '}
            <Link to="/cookies">política de cookies</Link>.
          </p>
        </section>
      </>
    ),
  },
  licencias: {
    title: 'Licencias y créditos',
    subtitle: 'Fuentes, mapas, librerías y sus condiciones.',
    body: (
      <>
        <section>
          <h2>Tipografías</h2>
          <ul>
            <li>
              <strong>Alfa Slab One</strong> — SIL Open Font License 1.1.
            </li>
            <li>
              <strong>Sofia Sans</strong> — SIL Open Font License 1.1.
            </li>
          </ul>
          <p>Las fuentes se sirven localmente desde este sitio, sin peticiones a Google Fonts.</p>
        </section>
        <section>
          <h2>Geometría del mapa</h2>
          <ul>
            <li>
              <strong>Natural Earth</strong> — datos de dominio público (1:50m y 1:110m).
            </li>
            <li>
              <strong>world-atlas</strong> — empaquetado TopoJSON de Natural Earth, licencia ISC.
            </li>
          </ul>
          <p>
            Las siluetas de respaldo son una simplificación propia para que el mapa siga funcionando
            sin geometría remota.
          </p>
        </section>
        <section>
          <h2>Software</h2>
          <ul>
            <li>React y React DOM — MIT.</li>
            <li>React Router — MIT.</li>
            <li>TanStack Query — MIT.</li>
            <li>GSAP — licencia estándar de GreenSock (uso gratuito para este proyecto).</li>
            <li>Lenis — MIT.</li>
            <li>Vite, Vitest, Biome y Playwright — MIT / Apache-2.0 según cada paquete.</li>
            <li>Fastify, Zod, Drizzle ORM y mysql2 — MIT / Apache-2.0 según cada paquete.</li>
          </ul>
          <p>
            Las versiones exactas están fijadas en los archivos <code>package-lock.json</code> del
            repositorio. Los textos de licencia de las dependencias se distribuyen con cada paquete.
          </p>
        </section>
        <section>
          <h2>Contenido gastronómico</h2>
          <p>
            Las recetas son referencias culturales recopiladas con fines educativos. Si sos autor de
            un texto o imagen y querés corregir el crédito, escribinos a{' '}
            <strong>{OWNER.email}</strong>.
          </p>
        </section>
      </>
    ),
  },
};

export const legalIndex: Array<{ slug: string; label: string; description: string }> = [
  { slug: 'privacidad', label: 'Privacidad', description: 'Datos, retención y derechos.' },
  { slug: 'terminos', label: 'Términos', description: 'Reglas de uso y edad mínima.' },
  { slug: 'cookies', label: 'Cookies', description: 'Categorías reales y cómo decidir.' },
  { slug: 'reembolsos', label: 'Reembolsos', description: 'Sitio gratuito, sin compras.' },
  { slug: 'licencias', label: 'Licencias', description: 'Fuentes, mapas y librerías.' },
  { slug: 'contacto', label: 'Contacto', description: 'Correo directo, sin formulario.' },
];

export { OWNER, REVIEW_NOTICE };
