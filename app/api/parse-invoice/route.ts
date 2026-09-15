import { NextResponse } from 'next/server';
import PDFParser from 'pdf2json';

export const runtime = 'nodejs'; // Força o ambiente Node.js na Vercel

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const pdfText = await new Promise<string>((resolve, reject) => {
      const pdfParser = new (PDFParser as any)(null, 1);
      pdfParser.on('pdfParser_dataError', (errData: any) => reject(errData.parserError));
      pdfParser.on('pdfParser_dataReady', () => {
        resolve(pdfParser.getRawTextContent());
      });
      pdfParser.parseBuffer(buffer);
    });

    const lines = pdfText.split(/\r?\n/);
    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Regex para pegar compras no formato "DD/MM ESTABELECIMENTO VALOR"
    const regexTransacao = /(\d{2}\/\d{2})\s+([A-Za-z0-9\s\*\.\-\/]+?)\s+([\d\.,]+)$/;

    for (const line of lines) {
      const cleanLine = line.trim();
      
      // Ignora pagamentos de fatura anteriores
      if (cleanLine.includes('Pagamento via conta') || cleanLine.includes('Total dos pagamentos')) {
        continue;
      }

      const match = cleanLine.match(regexTransacao);
      if (match) {
        const [_, data, descricao, valorStr] = match;
        
        // Trata valores no formato brasileiro (ex: 1.250,50 -> 1250.50)
        let formattedValor = valorStr;
        if (formattedValor.includes(',') && formattedValor.includes('.')) {
          formattedValor = formattedValor.replace('.', '').replace(',', '.');
        } else if (formattedValor.includes(',')) {
          formattedValor = formattedValor.replace(',', '.');
        }

        const valor = parseFloat(formattedValor);

        if (!isNaN(valor) && valor > 0) {
          transacoes.push({
            data,
            descricao: descricao.trim(),
            valor,
          });
        }
      }
    }

    return NextResponse.json({ success: true, count: transacoes.length, dados: transacoes });
  } catch (error) {
    console.error('Erro ao ler PDF:', error);
    return NextResponse.json({ error: 'Erro ao processar o arquivo da fatura' }, { status: 500 });
  }
}
