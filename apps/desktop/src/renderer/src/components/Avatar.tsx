import { useEffect, useState } from "react";
import { hue, initials } from "../lib/format";

export function Avatar({
  name,
  image,
  className = "",
  title,
  onClick,
  children,
  as = "div",
}: {
  name: string;
  image?: string | null;
  className?: string;
  title?: string;
  onClick?: () => void;
  children?: React.ReactNode;
  as?: "div" | "span" | "button";
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [image]);
  const show = Boolean(image && !broken);
  const classNames = `${className} ${show ? "has-photo" : ""}`.trim();
  const style = show ? undefined : { background: hue(name) };
  const photo = show ? (
    <img src={image!} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />
  ) : (
    initials(name)
  );

  if (as === "button" || onClick) {
    return (
      <button type="button" className={classNames} style={style} title={title} onClick={onClick}>
        {photo}
        {children}
      </button>
    );
  }
  if (as === "span") {
    return (
      <span className={classNames} style={style} title={title}>
        {photo}
        {children}
      </span>
    );
  }
  return (
    <div className={classNames} style={style} title={title}>
      {photo}
      {children}
    </div>
  );
}
