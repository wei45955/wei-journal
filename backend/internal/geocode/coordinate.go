package geocode

import "math"

// The Chinese map services speak GCJ-02, a coordinate system that offsets
// every point by a few hundred metres from the true position on the earth.
// Photographs carry WGS-84, and the map draws WGS-84, so everything the
// journal keeps is WGS-84 and the results of such a service are converted on
// the way in.
//
// The offset is a published algorithm: a point is bent by a small angle whose
// size depends on where it is. Subtracting the same bend again gives the
// original point back.

const (
	// The equator radius of the Krasovsky ellipsoid the offset is defined on.
	earthRadius = 6378245.0
	// The square of the flattening of that ellipsoid.
	flattening = 0.00669342162296594323
)

// gcjToWgs converts a GCJ-02 coordinate into the WGS-84 coordinate of the
// same place. The result is accurate to about a metre, which is well within
// what a photograph carries.
func gcjToWgs(lat, lon float64) (float64, float64) {
	if outOfChina(lat, lon) {
		return lat, lon
	}
	dLat, dLon := offset(lat, lon)
	return lat - dLat, lon - dLon
}

// wgsToGcj moves a WGS-84 coordinate to where the Chinese service places it.
func wgsToGcj(lat, lon float64) (float64, float64) {
	if outOfChina(lat, lon) {
		return lat, lon
	}
	dLat, dLon := offset(lat, lon)
	return lat + dLat, lon + dLon
}

// offset is the distance between the two coordinate systems at a point.
func offset(lat, lon float64) (float64, float64) {
	dLat := transformLat(lon-105.0, lat-35.0)
	dLon := transformLon(lon-105.0, lat-35.0)

	radius := lat / 180.0 * math.Pi
	magic := math.Sin(radius)
	magic = 1 - flattening*magic*magic
	sqrtMagic := math.Sqrt(magic)

	dLat = (dLat * 180.0) / ((earthRadius * (1 - flattening)) / (magic * sqrtMagic) * math.Pi)
	dLon = (dLon * 180.0) / (earthRadius / sqrtMagic * math.Cos(radius) * math.Pi)
	return dLat, dLon
}

func transformLat(x, y float64) float64 {
	ret := -100.0 + 2.0*x + 3.0*y + 0.2*y*y + 0.1*x*y + 0.2*math.Sqrt(math.Abs(x))
	ret += (20.0*math.Sin(6.0*x*math.Pi) + 20.0*math.Sin(2.0*x*math.Pi)) * 2.0 / 3.0
	ret += (20.0*math.Sin(y*math.Pi) + 40.0*math.Sin(y/3.0*math.Pi)) * 2.0 / 3.0
	ret += (160.0*math.Sin(y/12.0*math.Pi) + 320*math.Sin(y*math.Pi/30.0)) * 2.0 / 3.0
	return ret
}

func transformLon(x, y float64) float64 {
	ret := 300.0 + x + 2.0*y + 0.1*x*x + 0.1*x*y + 0.1*math.Sqrt(math.Abs(x))
	ret += (20.0*math.Sin(6.0*x*math.Pi) + 20.0*math.Sin(2.0*x*math.Pi)) * 2.0 / 3.0
	ret += (20.0*math.Sin(x*math.Pi) + 40.0*math.Sin(x/3.0*math.Pi)) * 2.0 / 3.0
	ret += (150.0*math.Sin(x/12.0*math.Pi) + 300.0*math.Sin(x/30.0*math.Pi)) * 2.0 / 3.0
	return ret
}

// outOfChina reports whether a point is outside the region where the offset
// applies. Everywhere else the two systems agree.
func outOfChina(lat, lon float64) bool {
	return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271
}
