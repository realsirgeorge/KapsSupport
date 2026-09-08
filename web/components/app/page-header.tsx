function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface PageHeaderProps {
  name?: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}

/** Optional first-name greeting above the page title, used on primary landing pages. */
export function PageHeader({ name, title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between">
      <div>
        {name && <p className="text-sm text-muted-foreground">{greeting()}, {name.split(' ')[0]}.</p>}
        <h1 className="mt-1 text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}
