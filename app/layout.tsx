export const metadata = {
  title: 'FaturAi',
  description: 'Leitor e contabilizador de faturas de cartão de crédito',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, padding: 0, backgroundColor: '#f9fafb' }}>
        {children}
      </body>
    </html>
  );
}
