const server = require("express").Router();
const fetch = require("node-fetch");
const meli = require("mercadolibre");

//Modelos
const {
  Product,
  Category,
  Orders,
  Productprovider,
  Provider,
} = require("../db.js");

//Shopify y MeLi
let {
  SHOPIFY_API_KEY,
  SHOPIFY_API_PASSWORD,
  APP_DOMAIN,
  USER_ID_MELI,
  client_id,
  client_secret,
  redirect_uri,
  code,
  access_token,
  refresh_token,
} = process.env;

//var refresh_token = "";
const testUrl = `https://${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}@${APP_DOMAIN}/admin/api/2020-07/`;

const mercadolibre = new meli.Meli(
  client_id,
  client_secret,
  access_token,
  refresh_token
);

const getUrlCode = mercadolibre.getAuthURL(redirect_uri);
// console.log(getUrlCode);

const meliAuthorize = mercadolibre.authorize(code, redirect_uri, (err, res) => {
  if (res.access_token) {
    // console.log(res);
    access_token = res.access_token;
    refresh_token = res.refresh_token;
  }
});

const meliRefreshToken = mercadolibre.refreshAccessToken((err, res) => {
  access_token = res.access_token;
  refresh_token = res.refresh_token;
  // console.log(res);
});

//Ruta que recibe la notificación desde shopify cuando se crea una nueva orden
server.post("/shopify", (req, res) => {
  const rta = req.body;
  console.log(JSON.stringify(rta));

  Orders.create({
    shopify_Id: req.body.id,
    cantidad: req.body.line_items[0].quantity,
    total: req.body.total_price,
    subtotal: req.body.subtotal_price,
    status: "created",
    user_Id: req.body.user_id,
  })
    .then((created) => res.status(200).send("Se ha creado la orden en la bd"))
    .catch((error) => console.error("Error: " + error));
});

//Ruta que recibe la notificación desde meli cuando se crea una nueva orden
server.post("/meli", (req, res) => {
  const rta = req.body;
  console.log("Llegó la respuesta de MELI: " + JSON.stringify(rta));
  var id = req.body.resource.split("/");
  var orderId = id[id.length - 1];
  console.log(orderId + " ACAAAAA");

  fetch(
    `https://api.mercadolibre.com/orders/${orderId}?access_token=${access_token}`,
    {
      method: "GET",
    }
  )
    .then((response) => response.json())
    .then((order) => {
      console.log(JSON.stringify(order) + "RESPUESTA MELI!!! ");
      return Orders.create({
        meli_Id: order.id,
        cantidad: order.order_items[0].quantity,
        total: order.total_amount,
        status: "created",
        user_Id: order.buyer.id,
      })
        .then((created) => {
          console.log(created);
          res.status(200).send(created);
        })
        .catch((error) => console.error("Error: " + error));
    });
});

  
//Ruta que recibe la notificación desde shopify cuando se crea/actualiza un producto
server.post("/shopify/create", (req, res, next) => {
  const productCreate = req.body;
  // console.log(productCreate.variants[0].sku);
  var productId;
  Product.findOrCreate({
    where: {
      title: productCreate.title,
      description: productCreate.body_html,
      sku: productCreate.variants[0].sku,
      stock_inicial: productCreate.variants[0].old_inventory_quantity,
      precio_inicial: productCreate.variants[0].price,
      images: productCreate.images.map((i) => {
        // console.log(i);
        return i.src;
      }),
      productId_Shopify: productCreate.id,
    },
  })
    .then((product) => {
      // console.log(product);
      productId = product[0].dataValues.id;
      return Category.findOrCreate({
        where: {
          title_sugerido: productCreate.handle,
        },
      });
    })
    .then((category) => {
      // console.log(category);
      return category[0].setProducts(productId);
    })
    .then((v) => {
      // console.log(v);
      return Provider.findByPk(2);
    })
    .then((provider) => {
      provider.setProducts(productId, {
        through: {
          link: `${APP_DOMAIN}/products/${productCreate.title}`,
          stock: productCreate.variants[0].inventory_quantity,
          precio: productCreate.variants[0].price,
        },
      });
    });
  res.send();
});


//Ruta que recibe la notificación desde meli cuando se crea/actualiza un producto
server.post("/newproduct/meli", (req, res) => {
  const rta = req.body;
  console.log("Llegó la respuesta de MELI: " + JSON.stringify(rta));
  var id = req.body.resource.split("/");
  var productId = id[id.length - 1];
  console.log(productId + " ACAAAAA");

  fetch(
    `https://api.mercadolibre.com/items/${productId}?access_token=${access_token}`,
    {
      method: "GET",
    }
  )
    .then((response) => response.json())
    .then((product) => {
      console.log(JSON.stringify(product) + "RESPUESTA MELI!!! ");
      Product.findOrCreate({
        where: {
          title: product.title,
          productId_Meli: product.id,
          images: product.pictures.map((i) => {
            return i.secure_url;
          })
        },
      })
      .then((product) => {
        console.log(product);
        productId = product[0].dataValues.id;
        return Category.findOrCreate({
          where: {
            title_sugerido: product.title
          }
        }) 
      })
      .then((category) => {
        // console.log(category);
        return category[0].setProducts(productId);
      })
      .then((v) => {
        // console.log(v);
        return Provider.findByPk(1);
      })
      .then((provider) => {
        provider.setProducts(productId, {
          through: {
            stock: product.initial_quantity,
            precio: product.price,
            link: product.permalink,
          },
        });
      })
      res.status(200)
      .catch((error) => console.error("Error: " + error));
   });
});


server.get("/orders/fulfilled", (req, res) => {
  Orders.findAll().then((order) => res.send(order));
});

module.exports = server;