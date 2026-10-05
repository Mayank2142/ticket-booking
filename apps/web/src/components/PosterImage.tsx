import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { assetUrl } from "../lib/api";

type PosterImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallbackSrc?: string;
};

const DEFAULT_POSTER = "/images/cinebook-stitch-home.png";

export function PosterImage({ src, fallbackSrc = DEFAULT_POSTER, alt = "", className = "", onLoad, onError, ...props }: PosterImageProps) {
  const fallback = assetUrl(fallbackSrc);
  const [currentSrc, setCurrentSrc] = useState(() => assetUrl(src || fallbackSrc));
  const [state, setState] = useState<"loading" | "loaded" | "fallback">("loading");

  useEffect(() => {
    setCurrentSrc(assetUrl(src || fallbackSrc));
    setState("loading");
  }, [fallbackSrc, src]);

  return (
    <img
      {...props}
      src={currentSrc}
      alt={alt}
      loading={props.loading ?? "lazy"}
      decoding={props.decoding ?? "async"}
      aria-busy={state === "loading"}
      data-image-state={state}
      className={`${className} poster-image ${state === "loading" ? "image-loading" : state === "fallback" ? "image-fallback" : "image-loaded"}`.trim()}
      onLoad={(event) => {
        setState(currentSrc === fallback && Boolean(src) ? "fallback" : "loaded");
        onLoad?.(event);
      }}
      onError={(event) => {
        if (currentSrc !== fallback) {
          setState("loading");
          setCurrentSrc(fallback);
        } else {
          setState("fallback");
          onError?.(event);
        }
      }}
    />
  );
}
