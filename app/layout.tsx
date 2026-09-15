export const metadata = {
  title: 'FaturAi — Gestão Inteligente de Faturas',
  description: 'Contabilize e analise seus gastos de cartão de crédito em segundos.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-slate-900 text-slate-100 font-['Inter',sans-serif] antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
