const csv = require('csvtojson');
const https = require('https');

// Path to csv to be imported
const CSV_FILE_PATH = './orders.csv';

// Shopify store credentials
const SHOPIFY_STORE_HANDLE = process.env.SHOPIFY_STORE_HANDLE;
const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY;
const SHOPIFY_API_PASSWORD = process.env.SHOPIFY_API_PASSWORD;
const SHOPIFY_STORE_CREDENTIALS = `${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}`;

// Add custom note or tag to each imported order
const order_note = 'Kickstarter/Indiegogo order ID: ';
const order_tag = 'IMPORTED';

(async () => {
  let records = await csv().fromFile(CSV_FILE_PATH);

  if (!records) {
    throw `Couldn\'t read records from CSV ${CSV_FILE_PATH}`;
  }

  console.log(`Read ${records.length} records from CSV ${CSV_FILE_PATH}`);

  let orders = {};

  records.forEach(record => {
    record.order_name = record.email.replace(/[^\w]+/g, '_');

    if (!orders['_' + record.order_name]) {
      orders['_' + record.order_name] = {
        imported: false,
        order_name: record.order_name,
        email: record.email,
        phone: record.phone,
        billing_name: record.billing_name,
        billing_company: record.company,
        billing_address1: record.billing_address1,
        billing_address2: record.billing_address2 || null,
        billing_city: record.billing_city,
        billing_zip: record.billing_zip,
        billing_province: record.billing_province && record.billing_province.length === 2 ?
          record.billing_province : null,
        billing_country: record.billing_country,
        line_items: [
          {
            title: record.lineitem_title,
            sku: record.lineitem_sku,
            price: 0.00,
            quantity: parseInt(record.lineitem_quantity)
          }
        ],
        shipping_method: record.shipping_method,
        tags: order_tag,
        note_attributes: record.note_attributes
      }
    } else {
      orders['_' + record.order_name].line_items.push({
        title: record.lineitem_title,
        sku: record.lineitem_sku,
        price: 0.00,
        quantity: parseInt(record.lineitem_quantity)
      })
    }
  });

  let ordersArr = [];

  for (let key in orders) {
    let order = orders[key];
    if (!order.imported) {
      ordersArr.push(order);
    }
  }

  console.log(`Imported ${ordersArr.length} orders from file ${CSV_FILE_PATH}`);

  for (let i = 0; i < ordersArr.length; i++) {
    let order = ordersArr[i];

    if (!order.imported) {
      console.log(`Uploading order ${i+1}/${ordersArr.length} to Shopify`);

      let customer  = {
        name: order.billing_name,
        email: order.email,
        phone: order.phone
      };

      let address = {
        name: customer.name,
        address1: order.billing_address1,
        address2: order.billing_address2,
        phone: order.phone,
        city: order.billing_city,
        zip: order.billing_zip,
        province_code: order.billing_province,
        country_code: order.billing_country
      };

      let shipping = {
        title: order.shipping_method,
        code: order.shipping_method,
        price: 0.00
      };

      let shopifyOrder = {
        order: {
          customer,
          billing_address: address,
          shipping_address: address,
          financial_status: 'paid',
          fulfillment_status: null,
          processing_method: 'manual',
          send_fulfillment_receipt: false,
          send_receipt: false,
          line_items: order.line_items.map(item => {
            return {
              title: item.title,
              sku: item.sku,
              price: 0.00,
              quantity: item.quantity
            }
          }),
          shipping_lines: [shipping],
          tags: order.tags,
          note: order.note_attributes ? order_note + order.note_attributes : ''
        }
      };

      let result = JSON.parse(await uploadOrder(shopifyOrder));

      if (result.errors) {
        console.log(result.errors)
      } else {
        console.log(`Uploaded order ${i+1}/${ordersArr.length} to Shopify`);
      }

      await sleep(1000);
    }
  }
})();

function sleep(delay) {
  return new Promise(resolve => setTimeout(resolve, delay))
}

async function uploadOrder(order) {
  return new Promise(async (resolve, reject) => {
    let body = JSON.stringify(order);

    let request = https.request(`https://${SHOPIFY_STORE_HANDLE}.myshopify.com/admin/api/2019-07/orders.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${new Buffer.from(SHOPIFY_STORE_CREDENTIALS).toString('base64')}`,
        'Content-Length': Buffer.byteLength(body),
        'Content-Type': 'application/json'
      }
    }, response => {
      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('error', error => reject(error));
      response.on('end', () => resolve(data))
    });

    request.write(body);
    request.end()
  })
}
