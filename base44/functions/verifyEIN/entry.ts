import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * Validates a US Federal EIN (Employer Identification Number).
 * Format: XX-XXXXXXX (2 digits, hyphen, 7 digits)
 * This validates the structural format and runs a plausibility check.
 * Replace the validation logic with your preferred IRS/third-party TIN
 * matching provider (e.g., IRS TIN Matching, Equifax, LexisNexis) API call.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { corporateId, federalEIN } = body;

    if (!federalEIN) {
      return Response.json({ error: 'federalEIN is required' }, { status: 400 });
    }

    const einStr = String(federalEIN).trim();

    // Strip any format characters
    const digits = einStr.replace(/\D/g, '');

    const errors = [];

    if (digits.length < 9) {
      errors.push('EIN must contain 9 digits');
    } else if (digits.length > 9) {
      errors.push('EIN cannot exceed 9 digits');
    }

    // First 2 digits: IRS prefix rules
    const prefix = digits.slice(0, 2);
    const validPrefixes = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '20', '21', '22', '23', '24', '25', '26', '27', '28', '30', '31', '32', '33', '34', '35', '36', '37', '38', '40', '41', '42', '43', '44', '45', '46', '47', '48', '50', '51', '52', '53', '54', '55', '56', '57', '58', '60', '61', '62', '63', '64', '65', '66', '67', '68', '71', '72', '73', '74', '75', '77', '80', '81', '83', '85', '86', '88', '91', '92', '95', '97', '98'];
    if (!validPrefixes.includes(String(prefix).padStart(2, '0'))) {
      errors.push(`Invalid IRS prefix "${String(prefix).padStart(2, '0')}" — not a recognized EIN prefix range`);
    }

    if (errors.length > 0) {
      return Response.json({ valid: false, errors });
    }

    // Format as XX-XXXXXXX
    const formatted = `${digits.slice(0, 2)}-${digits.slice(2)}`;

    // TODO: Replace with actual IRS TIN Matching API call
    // const tinMatchingResult = await callIRSTinMatchingApi(corporateId, digits);
    // if (!tinMatchingResult.match) { errors.push(tinMatchingResult.reason); }

    return Response.json({ valid: true, formatted, message: 'EIN format accepted' });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});