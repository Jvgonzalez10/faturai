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

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pdfData = await pdfParse(buffer);
    const text = pdfData.text || '';

    if (!text.trim()) {
      return NextResponse.json({ error: 'Nenhum texto foi encontrado no PDF.' }, { status: 400 });
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const transacaoLista: Array<{ data: string; descricao: string; valor: number }> = [];

    // Captura apenas data DD/MM no inicio da linha
    const regexData = /^(\d{2}\/\d{2})/;
    // Captura o valor financeiro no final da linha (ex: 123,45)
    const regexValor = /(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    let dentroDoExtrato = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. ANCORA DE INICIO: Entra no extrato no cabecalho de compras
      if (
        lineUpper.includes('LANÇAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANCAMENTOS: COMPRAS E SAQUES') ||
        lineUpper.includes('LANÇAMENTOS: PRODUTOS E SERVIÇOS')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. ANCORA DE FIM: Interrompe assim que chega nas compras futuras, boletos ou limites
      if (
        lineUpper.includes('COMPRAS PARCELADAS - PRÓXIMAS FATURAS') ||
        lineUpper.includes('COMPRAS PARCELADAS - PROXIMAS FATURAS') ||
        lineUpper.includes('LIMITES DE CRÉDITO') ||
        lineUpper.includes('ENCARGOS COBRADOS NESTA FATURA') ||
        lineUpper.includes('AUTENTICAÇÃO MECÂNICA') ||
        lineUpper.includes('FICHA DE COMPENSAÇÃO')
      ) {
        dentroDoExtrato = false;
      }

      if (!dentroDoExtrato) {
        continue;
      }

      // Filtros estritos para pular pagamentos, taxas, totais e textos institucionais
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('LANÇAMENTOS NO CARTÃO') ||
        lineUpper.includes('LANÇAMENTOS PRODUTOS E SERVIÇOS') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS ATUAIS') ||
        lineUpper.includes('ESTABELECIMENTO') ||
        lineUpper.includes('PRODUTOS/SERVIÇOS') ||
        lineUpper.includes('VALOR EM R$') ||
        lineUpper.includes('DATA')
      ) {
        continue;
      }

      const matchData = line.match(regexData);
      const matchValor = line.match(regexValor);

      if (matchData && matchValor) {
        const data = matchData[1];
        const valorStr = matchValor[1];

        // Limpeza da descricao
        let desc = line
          .replace(data, '')
          .replace(valorStr, '')
          .replace(/-topaz/gi, '')
          .replace(/topaz/gi, '')
          .replace(/R\$/g, '')
          .trim();

        // Elimina descricoes muito curtas, longas ou que contenham palavras de boleto/CPF
        if (
          desc.length < 2 ||
          desc.length > 50 ||
          desc.toUpperCase().includes('VALOR') ||
          desc.toUpperCase().includes('TOTAL')
        ) {
          continue;
        }

        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        // Somente aceita compras normais (abaixo de R$ 5.000,00 cada)
        if (!isNaN(valor) && valor > 0 && valor < 5000) {
          if (isNegative) {
            valor = -Math.abs(valor);
          }

          transacaoLista.push({
            data,
            descricao: desc,
            valor,
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      count: transacaoLista.length,
      dados: transacaoLista,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json({ error: 'Erro interno ao processar a fatura.' }, { status: 500 });
  }
}
