package web

import (
	"embed"
	"io/fs"
)

//go:embed all:static
var files embed.FS

func Static() (fs.FS, error) {
	return fs.Sub(files, "static")
}
