import { useEffect, useState } from 'react';

export type ViewportState = {
  width: number;
  height: number;
  isMobile: boolean;
  isPortrait: boolean;
  isLandscape: boolean;
};

const MOBILE_QUERY = '(max-width: 767px)';
const PORTRAIT_QUERY = '(orientation: portrait)';
const LANDSCAPE_QUERY = '(orientation: landscape)';

function readViewportState(): ViewportState {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isMobile = window.matchMedia(MOBILE_QUERY).matches;
  const isPortrait = window.matchMedia(PORTRAIT_QUERY).matches;
  const isLandscape = window.matchMedia(LANDSCAPE_QUERY).matches;

  return {
    width,
    height,
    isMobile,
    isPortrait,
    isLandscape,
  };
}

export function useViewport(): ViewportState {
  const [viewport, setViewport] = useState<ViewportState>(() => {
    if (typeof window === 'undefined') {
      return {
        width: 0,
        height: 0,
        isMobile: false,
        isPortrait: true,
        isLandscape: false,
      };
    }
    return readViewportState();
  });

  useEffect(() => {
    const mobileMedia = window.matchMedia(MOBILE_QUERY);
    const portraitMedia = window.matchMedia(PORTRAIT_QUERY);
    const landscapeMedia = window.matchMedia(LANDSCAPE_QUERY);

    const syncViewport = () => {
      setViewport(readViewportState());
    };

    const addMediaListener = (media: MediaQueryList) => {
      if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', syncViewport);
        return () => media.removeEventListener('change', syncViewport);
      }
      media.addListener(syncViewport);
      return () => media.removeListener(syncViewport);
    };

    const removeMobileListener = addMediaListener(mobileMedia);
    const removePortraitListener = addMediaListener(portraitMedia);
    const removeLandscapeListener = addMediaListener(landscapeMedia);

    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    syncViewport();

    return () => {
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      removeMobileListener();
      removePortraitListener();
      removeLandscapeListener();
    };
  }, []);

  return viewport;
}
