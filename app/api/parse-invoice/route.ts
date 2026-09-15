import { NextResponse } from 'next/server';
import PDFParser from 'pdf2json';

export const runtime = 'nodejs';

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

    const lines = pdfText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const transacoes: Array<{ data: string; descricao: string; valor: number }> = [];

    // Regex para identificar datas (DD/MM) e valores no formato brasileiro (ex: 45,00 ou 1.250,50)
    const regexData = /^(\d{2}\/\d{2})$/;
    const regexValor = /^([\d\.,]+)$/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Ignora trechos de pagamentos e resumo da fatura
      if (line.includes('Pagamento via conta') || line.includes('Total dos pagamentos')) {
        continue;
      }

      // Procura por linhas que começam com data DD/MM
      if (regexData.test(line)) {
        const data = line;
        let descricao = '';
        let valor = 0;

        // Procura a descrição e o valor nas linhas subsequentes
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const nextLine = lines[j];

          // Se encontrou o valor em R$
          if (regexValor.test(nextLine) && !descricao) {
            let valorClean = nextLine;
            if (valorClean.includes(',') && valorClean.includes('.')) {
              valorClean = valorClean.replace('.', '').replace(',', '.');
            } else if (valorClean.includes(',')) {
              valorClean = valorClean.replace(',', '.');
            }
            
            const parsedVal = parseFloat(valorClean);
            if (!isNaN(parsedVal) && parsedVal > 0) {
              valor = parsedVal;
            }
          } 
          // Se não for outra data nem valor, é o nome do estabelecimento
          else if (!regexData.test(nextLine) && !regexValor.test(nextLine) && !descricao) {
            if (!nextLine.includes('supermercado') && !nextLine.includes('restaurante') && !nextLine.includes('transporte') && !nextLine.includes('outros') && !nextLine.includes('saúde') && !nextLine.includes('serviços') && !nextLine.includes('lazer')) {
              descricao = nextLine;
            }
          }
        }

        if (data && valor > 0) {
          transacoes.push({
            data,
            descricao: descricao || 'Lançamento Cartão',
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
