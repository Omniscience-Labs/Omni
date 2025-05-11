import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title');

  const response = await fetch(`https://api.orshot.com/v1/studio/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ORSHOT_API_KEY}`,
    },
    body: JSON.stringify({
      templateId: 10,
      modifications: {
        title,
      },
      response: {
        type: 'binary',
      },
    }),
  });

  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  const image = Buffer.from(arrayBuffer);

  return new NextResponse(image, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
    },
  });
}
