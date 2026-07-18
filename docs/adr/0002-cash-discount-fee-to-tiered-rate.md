# Cash Discount tiered rate from Cardholder Card Fee

Cash Discount programs pass a Cardholder Card Fee to card-paying customers. MSPWare needs the matching tiered discount rate, not an independently chosen second number. We decided **tiered % = fee / (100 + fee)** (e.g. published Cash Discount 3.5% → 3.3816%; 3.99% → 3.8369%). Fixed self-serve Cash Discount publishes only 3.5%. Custom Cash Discount lets staff set fee in 3%–3.99% and always derives tiered % from that formula — never enter tiered % by hand as a separate negotiated field.

## Status

accepted
