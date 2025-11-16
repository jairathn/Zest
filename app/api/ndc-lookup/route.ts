import { NextRequest, NextResponse } from 'next/server';
import { findDrugByNdc } from '@/lib/ndc-mappings';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const ndcCode = searchParams.get('ndc');

    if (!ndcCode) {
      return NextResponse.json(
        { error: 'NDC code is required' },
        { status: 400 }
      );
    }

    // Look up drug information by NDC code
    const drugInfo = findDrugByNdc(ndcCode);

    if (!drugInfo) {
      return NextResponse.json(
        { error: 'Drug not found for this NDC code' },
        { status: 404 }
      );
    }

    return NextResponse.json(drugInfo);
  } catch (error) {
    console.error('Error looking up NDC:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
