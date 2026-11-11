import { handleNextApiRequest } from 'demo-cloud-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  return handleNextApiRequest(req, 'pack');
}

export async function POST(req: Request) {
  return handleNextApiRequest(req, 'pack');
}

export async function PUT(req: Request) {
  return handleNextApiRequest(req, 'pack');
}

export async function PATCH(req: Request) {
  return handleNextApiRequest(req, 'pack');
}

export async function DELETE(req: Request) {
  return handleNextApiRequest(req, 'pack');
}

export async function OPTIONS(req: Request) {
  return handleNextApiRequest(req, 'pack');
}
