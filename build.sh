cd src
uglify -s pmcomm.js -o pmcomm.min.js
rm ../examples/js/pmcomm.min.js
cp pmcomm.min.js ../examples/js/
jsdoc -d ../jsdoc --readme ../README.md  pmcomm.js
