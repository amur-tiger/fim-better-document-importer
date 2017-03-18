const gulp = require("gulp");
const rollup = require("gulp-rollup");
const replace = require("gulp-replace");
const concat = require("gulp-concat");
const merge = require("gulp-merge");

const typescript = require("rollup-plugin-typescript2");

const pkg = require("./package.json");
const external = Object.keys(pkg.dependencies || {});

gulp.task("build", () => {
    "use strict";

    merge(
        gulp.src("./header.txt")
            .pipe(replace(/\$\{version}/g, pkg.version))
            .pipe(replace(/\$\{description}/g, pkg.description))
            .pipe(replace(/\$\{author}/g, pkg.author))
            .pipe(replace(/\$\{homepage}/g, pkg.homepage))
            .pipe(replace(/\$\{bugs}/g, pkg.bugs.url)),

        gulp.src("./src/**/*.ts")
            .pipe(rollup({
                entry: "src/main.ts",
                plugins: [
                    typescript()
                ],
                external: external,
                format: "iife"
            }))
    )
        .pipe(concat(pkg.main))
        .pipe(gulp.dest("."));
});

gulp.task("watch", () => {
    "use strict";

    gulp.watch("./src/**/*.ts", ["build"]);
    gulp.watch("./header.txt", ["build"]);
    gulp.watch("./package.json", ["build"]);
});
