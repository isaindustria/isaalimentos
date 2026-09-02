import { Brand } from '@/components/AppShell';

/** Shown when the build has no Supabase credentials. */
export default function SetupPage() {
  return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="card max-w-lg w-full p-8">
        <Brand />
        <h1 className="font-display text-xl font-bold mt-6">Configuração necessária</h1>
        <p className="text-sm text-muted mt-2">
          O sistema ainda não está conectado ao banco de dados. Preencha o arquivo <code className="kbd">apps/web/.env</code> com a URL e a chave
          pública do projeto Supabase e gere o build novamente.
        </p>
        <pre className="mt-4 rounded-xl bg-surface-2 p-4 text-xs overflow-x-auto">
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
VITE_GITHUB_REPO=usuario/isa-alimentos`}
        </pre>
        <p className="text-xs text-muted mt-4">Depois execute as migrations em <code className="kbd">supabase/migrations</code> no SQL Editor do projeto.</p>
      </div>
    </div>
  );
}
