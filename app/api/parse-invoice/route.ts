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

    // Formato de data comum em faturas: DD/MM ou DD/MM/AAAA
    const regexData = /^(\d{2}\/\d{2}(?:\/\d{2,4})?)/;
    // Captura apenas valores monetarios validos no final da linha (ex: 123,45 ou -123,45)
    const regexValor = /(-?\s*[\d\.]+\,\d{2}\s*-?)$/;

    let dentroDoExtrato = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineUpper = line.toUpperCase();

      // 1. ANCORA DE INICIO: So comeca a ler quando entra na secao de extrato/lancamentos
      if (
        lineUpper.includes('LANÇAMENTO') ||
        lineUpper.includes('LANCAMENTO') ||
        lineUpper.includes('DETALHAMENTO') ||
        lineUpper.includes('TRANSAÇÃO') ||
        lineUpper.includes('TRANSACOES') ||
        lineUpper.includes('COMPRAS DO PERÍODO')
      ) {
        dentroDoExtrato = true;
        continue;
      }

      // 2. ANCORA DE FIM: Interrompe a leitura assim que sai dos lancamentos
      if (
        dentroDoExtrato &&
        (lineUpper.includes('RESUMO DA FATURA') ||
          lineUpper.includes('OPERAÇÕES DE CRÉDITO') ||
          lineUpper.includes('INFORMAÇÕES ADICIONAIS') ||
          lineUpper.includes('AUTENTICAÇÃO MECÂNICA') ||
          lineUpper.includes('PARCELAMENTO DE FATURA') ||
          lineUpper.includes('CÓDIGO DE BARRAS') ||
          lineUpper.includes('CAMPANHA') ||
          lineUpper.includes('MENSAGEM PARA VOCÊ'))
      ) {
        dentroDoExtrato = false;
        break;
      }

      // Se nao estiver dentro do bloco de extrato, ignora a linha
      if (!dentroDoExtrato) {
        continue;
      }

      // Filtros de seguranca adicionais para ignorar cabecalhos internos de tabelas
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('PAGAMENTO EFETUADO') ||
        lineUpper.includes('SALDO ANTERIOR') ||
        lineUpper.includes('ESTABELECIMENTO') ||
        lineUpper.includes('SUBTOTAL') ||
        lineUpper.includes('ENCARGOS') ||
        lineUpper.includes('LIMITE') ||
        lineUpper.includes('CREDITO') ||
        lineUpper.includes('TITULAR') ||
        lineUpper.includes('CARTÃO')
      ) {
        continue;
      }

      const matchData = line.match(regexData);
      const matchValor = line.match(regexValor);

      if (matchData && matchValor) {
        const data = matchData[1];
        const valorStr = matchValor[1];

        // Limpeza rigorosa do nome do estabelecimento
        let desc = line
          .replace(data, '')
          .replace(valorStr, '')
          .replace(/-topaz/gi, '')
          .replace(/topaz/gi, '')
          .replace(/R\$/g, '')
          .trim();

        // Ignora titulos, termos de resumo e descricoes invalidas
        if (
          desc.toUpperCase().includes('VALOR') ||
          desc.toUpperCase().includes('TOTAL') ||
          desc.length < 2 ||
          desc.length > 45
        ) {
          continue;
        }

        const isNegative = valorStr.includes('-');
        let cleanVal = valorStr.replace('-', '').replace(/\./g, '').replace(',', '.').trim();
        let valor = parseFloat(cleanVal);

        if (!isNaN(valor) && valor > 0) {
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
