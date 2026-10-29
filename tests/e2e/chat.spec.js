// Pruebas end-to-end: navegador real + frontend + backend + una-lib
const { test, expect } = require('@playwright/test');

// medios publicos, estables y en formatos que Chromium de Playwright puede reproducir
const IMAGEN_URL = 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';
const VIDEO_URL = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';
const SCRIPT = "<script>alert('Inyección de script');</script>";

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Username' }).fill('Playwright');
});

async function enviar(page, texto) {
  await page.getByRole('textbox', { name: 'Mensaje' }).fill(texto);
  await page.getByRole('button', { name: 'Send' }).click();
}

test('muestra una URL de imagen y termina de cargarla', async ({ page }) => {
  await enviar(page, IMAGEN_URL);

  const imagen = page.locator('#messages li img');
  await expect(imagen).toBeVisible();
  await expect(imagen).toHaveAttribute('src', IMAGEN_URL);
  // naturalWidth > 0 solo ocurre cuando el navegador descargo la imagen
  await expect.poll(() => imagen.evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.locator('#messages li').first()).toContainText('Playwright');
});

test('muestra una URL de video y carga el contenido', async ({ page }) => {
  await enviar(page, VIDEO_URL);

  const video = page.locator('#messages li video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('controls', '');
  // readyState >= 2 (HAVE_CURRENT_DATA) y dimensiones: el video cargo
  await expect.poll(() => video.evaluate((v) => v.readyState)).toBeGreaterThanOrEqual(2);
  expect(await video.evaluate((v) => v.videoWidth)).toBeGreaterThan(0);
});

test('muestra el reproductor de YouTube para un enlace de YouTube', async ({ page }) => {
  await enviar(page, 'https://www.youtube.com/watch?v=qYwlqx-JLok');

  const reproductor = page.locator('#messages li iframe');
  await expect(reproductor).toBeVisible();
  await expect(reproductor).toHaveAttribute('src', 'https://www.youtube.com/embed/qYwlqx-JLok');
});

test('el script del paso 2 no se ejecuta y el mensaje se sanea', async ({ page }) => {
  // se registra antes del envio: cualquier alert hace fallar la prueba
  const dialogos = [];
  page.on('dialog', async (dialog) => {
    dialogos.push(dialog.message());
    await dialog.dismiss();
  });

  await enviar(page, SCRIPT);

  const mensaje = page.locator('#messages li').last();
  // se muestra como texto literal, no como etiqueta
  await expect(mensaje).toContainText(SCRIPT);
  await expect(page.locator('#messages li script')).toHaveCount(0);
  await expect(mensaje.locator('script, img, iframe, video')).toHaveCount(0);

  // margen para que un alert tardio llegue a dispararse
  await page.waitForTimeout(500);
  expect(dialogos, `se ejecuto un alert: ${dialogos.join(', ')}`).toHaveLength(0);
});

test('un atributo malicioso dentro de una URL de imagen no se ejecuta', async ({ page }) => {
  const dialogos = [];
  page.on('dialog', async (dialog) => {
    dialogos.push(dialog.message());
    await dialog.dismiss();
  });

  await enviar(page, 'https://example.com/x.jpg" onerror="alert(1)');

  await expect(page.locator('#messages li').last()).toContainText('onerror');
  await expect(page.locator('#messages li img')).toHaveCount(0);
  await page.waitForTimeout(500);
  expect(dialogos).toHaveLength(0);
});
