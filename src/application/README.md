# `application/`

Casos de uso + **ports** (interfaces). Usa `domain` y las interfaces; no importa
`infrastructure` concreto. Se llena por PR: `ports/` (PaymentGateway, Mailer,
TaxDocumentService, AccessCodeProvider, repos) y servicios (checkout, holds, confirmPayment, cancel).
