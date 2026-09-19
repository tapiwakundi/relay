import type { Workspace } from "@relay/shared";

export function WorkspaceGlyph({
  workspace,
  className = "",
  title,
  onClick,
}: {
  workspace: Pick<Workspace, "name" | "iconColor" | "iconLetter" | "iconUrl">;
  className?: string;
  title?: string;
  onClick?: () => void;
}) {
  const photo = Boolean(workspace.iconUrl);
  const classNames = `ws-glyph ${className} ${photo ? "has-photo" : ""}`.trim();
  const inner = photo ? (
    <img src={workspace.iconUrl!} alt="" referrerPolicy="no-referrer" />
  ) : (
    workspace.iconLetter
  );
  if (onClick) {
    return (
      <button type="button" className={classNames} style={{ background: workspace.iconColor }} title={title} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return (
    <div className={classNames} style={{ background: workspace.iconColor }} title={title}>
      {inner}
    </div>
  );
}
