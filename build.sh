cd src
uglifyjs pmcomm.js > pmcomm.min.js
rm ../examples/js/pmcomm.min.js
cp pmcomm.min.js ../examples/js/
jsdoc -d ../jsdoc --readme ../README.md  pmcomm.js
