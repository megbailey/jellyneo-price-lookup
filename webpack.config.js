const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const CrxPackWebpackPlugin = require("crx-pack-webpack-plugin").default;

const isDevServer = Boolean(process.env.WEBPACK_SERVE);
const signingKey = path.resolve(__dirname, "jellyneo-price-lookup-key.pem");

function resolvePackKey() {
  if (fs.existsSync(signingKey)) {
    return signingKey;
  }

  const throwaway = path.join(os.tmpdir(), `jellyneo-price-lookup-build-${process.pid}.pem`);
  const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  fs.writeFileSync(throwaway, privateKey.export({ type: "pkcs8", format: "pem" }));
  console.log("jellyneo-price-lookup-key.pem not found; packing this build with a throwaway key.");
  return throwaway;
}

module.exports = {
  mode: "development",
  entry: {
    background: "./background.js",
    popup: "./popup.js",
  },
  devtool: "source-map",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js",
    clean: true,
    publicPath: "",
    uniqueName: "jellyneo-price-lookup",
    iife: true,
  },
  optimization: {
    runtimeChunk: false,
    splitChunks: false,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "./manifest.json", to: "" },
        { from: "./popup.html", to: "" },
        { from: "./popup.css", to: "" },
        { from: "./icons", to: "icons" },
      ],
    }),
    !isDevServer && new CrxPackWebpackPlugin({
      keyFile: resolvePackKey(),
      contentPath: path.resolve(__dirname, "dist"),
      outputPath: path.resolve(__dirname, "dist"),
      name: "jellyneo-price-lookup",
    }),
  ].filter(Boolean),
};
