import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, corporateId, locationId, conceptId, data } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    // — LIST —
    if (action === 'list') {
      const concepts = await base44.asServiceRole.entities.MerchantProcessingConcept.filter({ corporateId });
      return Response.json({ concepts });
    }

    // — ADD —
    if (action === 'add') {
      if (!locationId) {
        return Response.json({ error: 'locationId is required' }, { status: 400 });
      }

      const conceptData = {
        locationId,
        corporateId,
        conceptName: data.conceptName || locationId,
        dbaName: data.conceptName || '',
        mccCode: data.mccCode,
        industryType: data.industryType || '',
        monthlyCardSales: data.monthlyCardSales ? Number(data.monthlyCardSales) : 0,
        avgSaleAmount: data.avgSaleAmount ? Number(data.avgSaleAmount) : 0,
        highestTicketAmount: data.highestTicketAmount ? Number(data.highestTicketAmount) : 0,
        cardPresentPct: data.cardPresentPct != null ? Number(data.cardPresentPct) : 100,
        productDescription: data.productDescription || '',
      };

      if (data.annualRevenue) conceptData.annualRevenue = Number(data.annualRevenue);
      if (data.internetPct != null) conceptData.internetPct = Number(data.internetPct);
      if (data.motoPct != null) conceptData.motoPct = Number(data.motoPct);

      const concept = await base44.asServiceRole.entities.MerchantProcessingConcept.create(conceptData);
      return Response.json({ concept });
    }

    // — UPDATE —
    if (action === 'update') {
      if (!conceptId) {
        return Response.json({ error: 'conceptId is required for update' }, { status: 400 });
      }

      const updateFields = {};
      if (data?.conceptName !== undefined) updateFields.conceptName = data.conceptName;
      if (data?.dbaName !== undefined) updateFields.dbaName = data.dbaName;
      if (data?.mccCode !== undefined) updateFields.mccCode = data.mccCode;
      if (data?.industryType !== undefined) updateFields.industryType = data.industryType;
      if (data?.monthlyCardSales !== undefined) updateFields.monthlyCardSales = Number(data.monthlyCardSales);
      if (data?.avgSaleAmount !== undefined) updateFields.avgSaleAmount = Number(data.avgSaleAmount);
      if (data?.highestTicketAmount !== undefined) updateFields.highestTicketAmount = Number(data.highestTicketAmount);
      if (data?.cardPresentPct !== undefined) updateFields.cardPresentPct = Number(data.cardPresentPct);
      if (data?.productDescription !== undefined) updateFields.productDescription = data.productDescription;

      const updated = await base44.asServiceRole.entities.MerchantProcessingConcept.update(conceptId, updateFields);
      return Response.json({ concept: updated });
    }

    return Response.json({ error: 'Unknown action. Use list, add, or update.' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});