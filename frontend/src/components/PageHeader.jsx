export default function PageHeader({
  className,
  title,
  subtitle,
  titleClassName,
  subtitleClassName,
  tag,
  actions,
}) {
  return (
    <header className={className}>
      <div>
        <h1 className={titleClassName}>{title}</h1>
        {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
      </div>
      {tag ? <div>{tag}</div> : null}
      {actions ? actions : null}
    </header>
  );
}
