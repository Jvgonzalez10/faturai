import { NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';

export const runtime = 'nodejs';

// Função auxiliar para converter qualquer formato numérico do PDF
function parseValue(valStr: string): number {
  let clean = valStr.trim();
  const isNegative = clean.includes('-');
  clean = clean.replace('-', '').replace(/R\$/g, '').trim();

  if (clean.includes(',')) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (clean.includes('.')) {
    const parts = clean.split('.');
    if (parts.length > 2) {
      const dec = parts.pop();
      clean = parts.join('') + '.' + dec;
    } else if (parts.length === 2 && parts[1].length === 2) {
      clean = parts[0] + '.' + parts[1];
    }
  }

  const val = parseFloat(clean);
  if (isNaN(val)) return 0;
  return isNegative ? -Math.abs(val) : val;
}

// Extrai o valor do total oficial do cabeçalho do documento
function extractTotalAmount(fullText: string): number {
  const match1 = fullText.match(/Total\s+desta\s+fatura[\s\S]{1,60}?([\d\.\,]{4,15})/i);
  if (match1) {
    const val = parseValue(match1[1]);
    if (val > 10) return val;
  }

  const match2 = fullText.match(/O\s+total\s+da\s+sua\s+fatura[\s\S]{1,120}?R\$\s*([\d\.\,]{4,15})/i);
  if (match2) {
    const val = parseValue(match2[1]);
    if (val > 10) return val;
  }

  return 0;
}

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

    const totalFaturaOficial = extractTotalAmount(text);

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const transacaoLista: Array<{ data: string; descricao: string; valor: number }> = [];

    let dentroPagamentos = false;
    let dentroProximasFaturas = false;

    // Regex para linhas de transação: Data (DD/MM) + Descrição + Parcela Opcional + Valor
    const regexTransacao = /^(\d{2}\/\d{2})\s*(.*?)(?:(\d{2}\/\d{2}))?\s*(-?\s*[\d\.\,]+)$/;

    for (let i = 0; i < lines.length; i++) {
      // Remove barras "|" e múltiplos espaços para padronizar o texto da linha
      const lineClean = lines[i].replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
      const lineNorm = lineClean.replace(/\s+/g, '').toUpperCase();
      const lineUpper = lineClean.toUpperCase();

      // 1. ISOLA SEÇÃO DE PAGAMENTOS ANTERIORES
      if (lineNorm.includes('PAGAMENTOSEFETUADOS') || lineNorm.includes('PAGAMENTOS')) {
        dentroPagamentos = true;
      }
      if (lineNorm.includes('TOTALDOSPAGAMENTOS') || lineNorm.includes('LANÇAMENTOS:')) {
        dentroPagamentos = false;
      }
      if (dentroPagamentos) continue;

      // 2. ISOLA PRÓXIMAS FATURAS / LIMITES
      if (
        lineNorm.includes('PRÓXIMASFATURAS') ||
        lineNorm.includes('PROXIMASFATURAS') ||
        lineNorm.includes('LIMITESDECRÉDITO') ||
        lineNorm.includes('ENCARGOSCOBRADOS')
      ) {
        dentroProximasFaturas = true;
      }
      if (lineNorm.includes('LANÇAMENTOS:') || lineNorm.includes('LANCAMENTOS:')) {
        dentroProximasFaturas = false;
      }
      if (dentroProximasFaturas) continue;

      // 3. DESCONSIDERA CABEÇALHOS E PAGAMENTOS DA CONTA
      if (
        lineUpper.includes('PAGAMENTO VIA CONTA') ||
        lineUpper.includes('TOTAL DOS PAGAMENTOS') ||
        lineUpper.includes('LANÇAMENTOS NO CARTÃO') ||
        lineUpper.includes('TOTAL DOS LANÇAMENTOS') ||
        lineUpper.startsWith('ESTABELECIMENTO') ||
        lineUpper.startsWith('PRODUTOS/SERVIÇOS')
      ) {
        continue;
      }

      const match = lineClean.match(regexTransacao);

      if (match) {
        const data = match[1];
        let desc = match[2].trim();
        const parcela = match[3];
        const valorStr = match[4];

        const descUpper = desc.toUpperCase();

        // Ignora linhas que sejam puramente pagamento da fatura anterior
        if (
          descUpper === 'PAGAMENTO' ||
          descUpper.startsWith('PAGAMENTO VIA') ||
          descUpper.startsWith('PAGAMENTO EFETUADO')
        ) {
          continue;
        }

        if (desc.length < 2) continue;

        if (parcela) {
          desc = `${desc} ${parcela}`.trim();
        }

        const valor = parseValue(valorStr);

        if (valor !== 0 && Math.abs(valor) < 50000) {
          transacaoLista.push({
            data,
            descricao: desc,
            valor,
          });
        }
      }
    }

    // 4. RECONCILIAÇÃO FINANCEIRA AUTOMÁTICA
    const somaCalculada = transacaoLista.reduce((acc, item) => acc + item.valor, 0);

    if (totalFaturaOficial > 0) {
      const diferenca = Math.round((totalFaturaOficial - somaCalculada) * 100) / 100;

      if (diferenca > 0.01) {
        transacaoLista.push({
          data: '--',
          descricao: 'ENCARGOS / JUROS DA FATURA',
          valor: diferenca,
        });
      } else if (diferenca < -0.01) {
        transacaoLista.push({
          data: '--',
          descricao: 'CRÉDITO / SALDO DE FATURA ANTERIOR',
          valor: diferenca,
        });
      }
    }

    const totalFinal = totalFaturaOficial > 0 ? totalFaturaOficial : somaCalculada;

    return NextResponse.json({
      success: true,
      totalFatura: totalFinal,
      count: transacaoLista.length,
      dados: transacaoLista,
    });
  } catch (error) {
    console.error('Erro no processamento do PDF:', error);
    return NextResponse.json({ error: 'Erro interno ao processar a fatura.' }, { status: 500 });
  }
}
