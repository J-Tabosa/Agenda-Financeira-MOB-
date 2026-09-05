# Agenda Financeira

PWA local e instalável para controle financeiro pessoal, feita para registrar gastos em poucos segundos no celular.

## Estado inicial
- Saldo em 04/09/2026: R$ 400
- Entrada SENAI prevista: R$ 1.600–1.800
- Meta de reserva do mês: R$ 1.000
- Renner: R$ 343, vencimento 30/09/2026
- BB atual: R$ 389
- BB projetado: R$ 744 com ChatGPT, corte, recarga, academia e Netflix
- Próximo salário informado: R$ 3.600

## Recursos
- Registro rápido de gasto ou entrada
- Separação entre débito/dinheiro, BB e Renner
- Atalhos para iFood e cinema
- Resumo de saldo, reserva e faturas
- Projeção do ritmo de gasto com iFood
- Histórico local
- Exportação e importação de backup JSON
- Funcionamento offline via Service Worker
- Instalação como PWA no Android

## Privacidade
Os dados ficam no `localStorage` do próprio navegador. Nenhum gasto é enviado para servidor.

## GitHub Pages
O projeto inclui um workflow em `.github/workflows/pages.yml`. Depois de habilitar Pages com **GitHub Actions** como fonte, cada push em `main` publica automaticamente o site.
