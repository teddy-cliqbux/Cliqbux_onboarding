import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, corporateId, locationId, merchantIDId, data } = body;

    if (!corporateId) {
      return Response.json({ error: 'corporateId is required' }, { status: 400 });
    }

    // — LIST —
    if (action === 'list') {
      const merchantMIDs = await base44.asServiceRole.entities.MerchantMID.filter({ corporateId });
      return Response.json({ merchantIDs: merchantMIDs || [] });
    }

    // — ADD —
    if (action === 'add') {
      if (!locationId) return Response.json({ error: 'locationId is required' }, { status: 400 });
      const merchantMIDData = {
        locationId,
        corporateId,
        merchantName: data?.merchantName || locationId,
        dbaName: data?.merchantName || data?.dbaName || '',
        mccCode: data?.mccCode || '',
        industryType: data?.industryType || '',
        monthlyCardSales: data?.monthlyCardSales ? Number(data.monthlyCardSales) : 0,
        avgSaleAmount: data?.avgSaleAmount ? Number(data.avgSaleAmount) : 0,
        highestTicketAmount: data?.highestTicketAmount ? Number(data.highestTicketAmount) : 0,
        cardPresentPct: data?.cardPresentPct != null ? Number(data.cardPresentPct) : 100,
        internetPct: data?.internetPct != null ? Number(data.internetPct) : 0,
        motoPct: data?.motoPct != null ? Number(data.motoPct) : 0,
        applicationStepStatus: 'In Review',
      };
      const merchantMID = await base44.asServiceRole.entities.MerchantMID.create(merchantMIDData);

      // Auto-create MSPWare draft immediately so signApplication doesn't have to do it lazily
      try {
        await base44.functions.invoke('submitToMSP', { corporateId, midIds: [merchantMID.id] });
      } catch (e) {
        console.warn('[manageMerchantID] submitToMSP draft creation failed (non-fatal):', e.message);
      }

      return Response.json({ merchantID: merchantMID });
    }

    // — UPDATE —
    if (action === 'update') {
      if (!merchantIDId) return Response.json({ error: 'merchantIDId is required for update' }, { status: 400 });
      const existing = await base44.asServiceRole.entities.MerchantMID.get(merchantIDId);
      const LOCKED = ['Pending MID', 'Active', 'Active (Existing)'];
      if (existing && LOCKED.includes(existing.applicationStepStatus) && !(data?.applicationStepStatus !== undefined && Object.keys(data).length === 1)) {
        return Response.json({ error: 'Cannot edit: Application is in a locked status' }, { status: 403 });
      }
      const updateFields = {};
      const d = data || {};
      // Renaming the merchant name also updates the DBA sent to Elavon, mirroring the prior behavior.
      if (d.merchantName !== undefined) { updateFields.merchantName = d.merchantName; updateFields.dbaName = d.merchantName; }
      if (d.mccCode !== undefined) updateFields.mccCode = d.mccCode;
      if (d.industryType !== undefined) updateFields.industryType = d.industryType;
      if (d.monthlyCardSales !== undefined) updateFields.monthlyCardSales = Number(d.monthlyCardSales);
      if (d.avgSaleAmount !== undefined) updateFields.avgSaleAmount = Number(d.avgSaleAmount);
      if (d.highestTicketAmount !== undefined) updateFields.highestTicketAmount = Number(d.highestTicketAmount);
      if (d.cardPresentPct !== undefined) updateFields.cardPresentPct = Number(d.cardPresentPct);
      if (d.internetPct !== undefined) updateFields.internetPct = Number(d.internetPct);
      if (d.motoPct !== undefined) updateFields.motoPct = Number(d.motoPct);
      if (d.locationId !== undefined) updateFields.locationId = d.locationId;
      if (d.applicationStepStatus !== undefined) updateFields.applicationStepStatus = d.applicationStepStatus;
      const updated = await base44.asServiceRole.entities.MerchantMID.update(merchantIDId, updateFields);
      return Response.json({ updatedMerchantID: updated, merchantID: updated });
    }

    // — DELETE —
    if (action === 'delete') {
      if (!merchantIDId) return Response.json({ error: 'merchantIDId is required for delete' }, { status: 400 });
      const toDelete = await base44.asServiceRole.entities.MerchantMID.get(merchantIDId);
      const LOCKED = ['Pending MID', 'Active', 'Active (Existing)'];
      if (toDelete && LOCKED.includes(toDelete.applicationStepStatus)) {
        return Response.json({ error: 'Cannot delete: Application is in a locked status' }, { status: 403 });
      }
      await base44.asServiceRole.entities.MerchantMID.delete(merchantIDId);
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Unknown action. Use list, add, update, or delete.' }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
