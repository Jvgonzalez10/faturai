import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdfParse(buffer);
    const text = data.text;

    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Quebra o texto por linhas e remove espacos vazios
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // Expressao regular para capturar "DD/MM NOME DO ESTABELECIMENTO VALOR"
    const regexTransacao = /^(\d{2}\/\d{2})\s+(.+?)\s+([\d\.,]+)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ignora trechos de pagamentos de fatura anterior e totais
      if (
        line.includes('Pagamento via conta') ||
        line.includes('Total dos pagamentos') ||
        line.includes('ESTABELECIMENTO') ||
        line.includes('Lançamentos')
      ) {
        continue;
      }

      const match = line.match(regexTransacao);

      if (match) {
        const [_, dt, desc, valStr] = match;

        // Trata valores monetários no formato BR
        let valClean = valStr;
        if (valClean.includes(',') && valClean.includes('.')) {
          valClean = valClean.replace(/\./g, '').replace(',', '.');
        } else if (valClean.includes(',')) {
          valClean = valClean.replace(',', '.');
        }

        const valor = parseFloat(valClean);

        if (!isNaN(valor) && valor > 0 && desc.length > 2) {
          transacoes.push({
            data: dt,
            descricao: desc.trim(),
            valor,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: transacoes.length,
      dados: transacoes,
    });
  } catch (error) {
    console.error('Erro ao processar PDF:', error);
    return NextResponse.json({ error: 'Erro ao processar o arquivo da fatura' }, { status: 500 });
  }
}
