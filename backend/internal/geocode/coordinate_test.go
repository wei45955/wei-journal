package geocode

import "testing"

func TestGcjToWgsRoundTrip(t *testing.T) {
	// A point in Shanghai, and one in Beijing.
	points := []struct {
		name string
		lat  float64
		lon  float64
	}{
		{"shanghai", 31.2304, 121.4737},
		{"beijing", 39.9042, 116.4074},
		{"shenzhen", 22.5431, 114.0579},
	}
	for _, point := range points {
		t.Run(point.name, func(t *testing.T) {
			// The offset moves the point by a few hundred metres; undoing it
			// has to land back where it started.
			shiftedLat, shiftedLon := gcjOffsetFor(point.lat, point.lon)
			if shiftedLat == point.lat && shiftedLon == point.lon {
				t.Fatalf("the point did not move at all")
			}
			backLat, backLon := gcjToWgs(shiftedLat, shiftedLon)
			if diff(backLat, point.lat) > 0.0001 || diff(backLon, point.lon) > 0.0001 {
				t.Fatalf("round trip gave %f,%f, wanted %f,%f", backLat, backLon, point.lat, point.lon)
			}
		})
	}
}

func TestGcjToWgsLeavesOtherPlacesAlone(t *testing.T) {
	// London is outside the region where the offset applies.
	lat, lon := 51.5074, -0.1278
	backLat, backLon := gcjToWgs(lat, lon)
	if backLat != lat || backLon != lon {
		t.Fatalf("a point outside the region was moved to %f,%f", backLat, backLon)
	}
}

func diff(a, b float64) float64 {
	if a > b {
		return a - b
	}
	return b - a
}

// gcjOffsetFor moves a point the way the Chinese service would, so the test
// can undo it again.
func gcjOffsetFor(lat, lon float64) (float64, float64) {
	dLat, dLon := offset(lat, lon)
	return lat + dLat, lon + dLon
}
