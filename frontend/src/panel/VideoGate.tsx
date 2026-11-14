import { useState } from 'react';
import { useConsent } from '../consent/ConsentContext';
import { safeYoutubeId } from '../lib/format';

export function VideoGate({ youtubeId, name }: { youtubeId: string | null; name: string }) {
  const id = safeYoutubeId(youtubeId);
  const { canLoadThirdParty, openBanner } = useConsent();
  const [playing, setPlaying] = useState(false);

  if (!id) {
    return <div className="vid-none">🎥 El video de esta receta llega pronto</div>;
  }

  if (playing && canLoadThirdParty) {
    return (
      <div className="vid">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
          title={`Video de la receta ${name}`}
          loading="lazy"
          allowFullScreen
          allow="accelerometer; encrypted-media; picture-in-picture"
        />
      </div>
    );
  }

  return (
    <div className="vid">
      {canLoadThirdParty ? (
        <button
          className="poster"
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`Reproducir video de ${name}`}
        >
          <span className="play">▶</span>
          <span className="poster-txt">Ver preparación paso a paso</span>
        </button>
      ) : (
        <div className="vid-consent">
          <span className="play" aria-hidden="true">
            ▶
          </span>
          <p>
            Los videos de YouTube son de terceros. Activalos cuando quieras desde las preferencias
            de cookies.
          </p>
          <button className="btn-ghost" type="button" onClick={openBanner}>
            Activar videos
          </button>
        </div>
      )}
    </div>
  );
}
