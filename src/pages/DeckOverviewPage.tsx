export interface DeckOverviewProps {
  action: string;
  params: URLSearchParams;
}

export default function DeckOverviewPage({ action, params }: DeckOverviewProps) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="fards-title text-4xl">卡组概览出图</h1>
      <p className="mt-4 text-field-200">
        占位页。action={action} deck_code={params.get('deck_code')} deck_slug={params.get('deck_slug')}
      </p>
    </main>
  );
}
