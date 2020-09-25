const { crearProducto } = require('./utils');
const server = require("express").Router();
const request = require("request-promise");
const meli = require("mercadolibre");
const fetch = require('node-fetch')

//Modelos
const { Product, Category, Orders, Productprovider, Provider } = require("../db.js");

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

server.get("/", async (req, res, next) => {
  //Ruta para traer todos los productos de Shopify
  const testUrlShopify = `https://${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}@${APP_DOMAIN}/admin/api/2020-07/`;

  let optionsShopify = {
    method: "GET",
    uri: testUrlShopify + "products.json",
    json: true,
  };
  const productsShopify = await request(optionsShopify);

  //Ruta para traer los items de un user de MeLi
  const rutaMeli = "https://api.mercadolibre.com";
  const testUrlMeLI = `${rutaMeli}/users/${USER_ID_MELI}/items/search?access_token=${access_token}`;

  const optionsMeli = { method: "GET", uri: testUrlMeLI, json: true };
  const productsMeLi = await request(optionsMeli);
  const resultado = productsMeLi.results;

  var productMeLi = [];
  for (let i = 0; i < resultado.length; i++) {
    const testUrlMeliProduct = `${rutaMeli}/items?ids=${resultado[i]}&access_token=${access_token}`;

    let optionsMeliProduct = {
      method: "GET",
      uri: testUrlMeliProduct,
      json: true,
    };

    let producto = await request(optionsMeliProduct);
    productMeLi.push(producto);
  }

  res.json({ productMeLi, productsShopify });
});

//Borrar un producto
server.delete("/:id", (req, res) => {
  const { id } = req.params;
  var idML = "";

  Product.findOne({ where: { id: req.params.id } })
    .then((product) => {
      if (!product) return "Id no válido";
      // console.log('product encontrado: '+ JSON.stringify(product))
      idML = product.idML;
      product.destroy().then(() => {
        // console.log('producto borrado db: '+ JSON.stringify(product))
      });
      fetch(
        `https://api.mercadolibre.com/items/${idML}?access_token=${token}`,
        {
          method: "PUT",
          header: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ status: "closed" }),
        }
      ).then((res) => res.json());
    })
    .catch((error) => {
      console.error("Error:", error);
      res.status(500).send(error);
    });

  fetch(
    `https://${SHOPIFY_API_KEY}:${SHOPIFY_API_PASSWORD}@${APP_DOMAIN}/admin/api/2020-07/` +
      `/products/${req.params.id}.json`,
    {
      method: "DELETE",
    }
  )
    .then((res) => res.json())
    .then((res) => res.send("OK"))
    .catch((error) => {
      res.status(500).send(error);
    });
});

//Crear o encontrar producto en DB
server.post("/", async (req, res) => {
  
  //Crea y devuelve el producto
  const p = await crearProducto(req)

  res.send(p);
});

//Publicar un producto en MELI
server.post("/meli/:id", (req, res) => {
console.log(req.params.id)
  Product.findOne({ where: {
    id: req.params.id },
    include: 
      [ Category, Provider ]
  })
  .then(prod => {
    console.log(prod)

    var data =  {
      title: prod.dataValues.title,
      category_id: prod.dataValues.categories[0].id_Meli,
      price: prod.providers[0].dataValues.productprovider.precio,
      currency_id:"ARS",
      available_quantity: prod.providers[0].dataValues.productprovider.stock,
      condition:"new",
      listing_type_id:"gold_special",
      description:{
         plain_text: prod.dataValues.description
      },
      sale_terms:[
         {
          id:"WARRANTY_TYPE",
          value_name:""
         },
         {
          id:"WARRANTY_TIME",
          value_name:"90 días"
         }
      ],
      pictures:[
        {
          source: null
        }
      ],
      attributes:[
        {
          id:"COLOR",
          value_name:"Azul"
         },
         {
          id:"SIZE",
          value_name: "M"
         }
      ]
    }; console.log(data);
    fetch(`https://api.mercadolibre.com/items?access_token=${access_token}`, {
      method: 'POST', 
      body: JSON.stringify(data)})
      .then(res => res.json())
      .then((response)=> {
        console.log('Se creo el producto: '+ JSON.stringify(response) + ' en MELI')
      })
      .catch(err => res.status(502).json({ 
        error: "No se pudo crear el producto en MELI"
      }))
  })
})

module.exports = server;
