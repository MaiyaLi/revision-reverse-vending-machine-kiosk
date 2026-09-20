import unittest

from scripts.yolo_detect import (
    CropFeatures,
    SENSOR_MIN_ACCEPT_CONFIDENCE,
    VISION_ONLY_MIN_ACCEPT_CONFIDENCE,
    appearance_scores,
    aspect_ratio_from_dimensions,
    canonical_item_name,
    confidence_for,
    effective_aspect_ratio,
    has_metallic_surface,
    is_bottle_shape,
    is_can_shape,
    is_lying_can_candidate,
    is_lying_can_shape,
    is_metallic_crop,
    material_from_class,
    orientation_invariant_aspect_ratio,
)


class VisionContractTests(unittest.TestCase):
    def test_canonical_item_names(self):
        self.assertEqual(canonical_item_name("aluminum"), "Aluminum Can")
        self.assertEqual(canonical_item_name("plastic"), "Plastic Bottle")
        self.assertEqual(canonical_item_name("glass"), "Glass Bottle")

    def test_orientation_invariant_aspect_ratio(self):
        self.assertAlmostEqual(orientation_invariant_aspect_ratio(0.25), 4.0)
        self.assertAlmostEqual(orientation_invariant_aspect_ratio(4.0), 4.0)

    def test_effective_aspect_ratio_uses_contour_orientation(self):
        features = CropFeatures(
            saturation_mean=0.0,
            value_mean=0.0,
            value_std=0.0,
            colorfulness=0.0,
            edge_ratio=0.0,
            specular_ratio=0.0,
            dark_ratio=0.0,
            extent=0.5,
            solidity=0.5,
            oriented_aspect_ratio=3.6,
        )
        self.assertEqual(effective_aspect_ratio(0.2, features), 3.6)

    def test_effective_aspect_ratio_falls_back_to_box_ratio(self):
        features = CropFeatures(
            saturation_mean=0.0,
            value_mean=0.0,
            value_std=0.0,
            colorfulness=0.0,
            edge_ratio=0.0,
            specular_ratio=0.0,
            dark_ratio=0.0,
            extent=0.05,
            solidity=0.5,
            oriented_aspect_ratio=3.6,
        )
        self.assertEqual(effective_aspect_ratio(0.2, features), 5.0)

    def test_oriented_aspect_ratio_preserves_subpixel_dimensions(self):
        self.assertEqual(aspect_ratio_from_dimensions(12.0, 0.8), 15.0)

    def test_effective_aspect_ratio_uses_near_lying_contour(self):
        features = CropFeatures(
            saturation_mean=0.0,
            value_mean=0.0,
            value_std=0.0,
            colorfulness=0.0,
            edge_ratio=0.0,
            specular_ratio=0.0,
            dark_ratio=0.0,
            extent=0.5,
            solidity=0.5,
            oriented_aspect_ratio=1.4,
        )
        self.assertGreater(effective_aspect_ratio(0.8, features), 1.25)

    def test_upright_can_accepts_wide_ratio(self):
        self.assertTrue(is_can_shape(0.25, extent=0.5))

    def test_lying_can_accepts_aspect_ratio_boundaries(self):
        self.assertTrue(is_lying_can_shape(1.8, extent=0.24, solidity=0.42))
        self.assertTrue(is_lying_can_shape(10.0, extent=0.24, solidity=0.42))
        self.assertFalse(is_lying_can_shape(1.79, extent=0.24, solidity=0.42))
        self.assertFalse(is_lying_can_shape(10.01, extent=0.24, solidity=0.42))

    def test_near_square_rotated_can_uses_contour_orientation(self):
        self.assertTrue(is_lying_can_shape(0.95, extent=0.20, solidity=0.30, shape_ratio=5.8))
        self.assertTrue(is_lying_can_shape(0.20, extent=0.20, solidity=0.30, shape_ratio=3.6))

    def test_lying_bottle_uses_relaxed_geometry(self):
        self.assertTrue(is_bottle_shape(4.0, extent=0.05, solidity=0.09))
        features = CropFeatures(
            saturation_mean=0.45,
            value_mean=0.60,
            value_std=0.12,
            colorfulness=0.18,
            edge_ratio=0.05,
            specular_ratio=0.03,
            dark_ratio=0.05,
            extent=0.05,
            solidity=0.09,
            oriented_aspect_ratio=4.0,
        )
        scores = {"aluminum": 0.10, "glass": 0.20, "plastic": 0.78}
        self.assertEqual(
            material_from_class("bottle", 4.0, False, 0, None, True, features, scores),
            "plastic",
        )

    def test_lying_bottle_uses_geometry_and_appearance_separately(self):
        shape_features = CropFeatures(
            saturation_mean=0.0,
            value_mean=0.0,
            value_std=0.0,
            colorfulness=0.0,
            edge_ratio=0.0,
            specular_ratio=0.0,
            dark_ratio=0.0,
            extent=0.05,
            solidity=0.09,
            oriented_aspect_ratio=4.0,
        )
        appearance_features = CropFeatures(
            saturation_mean=0.45,
            value_mean=0.60,
            value_std=0.12,
            colorfulness=0.18,
            edge_ratio=0.05,
            specular_ratio=0.03,
            dark_ratio=0.05,
            extent=0.20,
            solidity=0.30,
            oriented_aspect_ratio=4.0,
        )
        scores = appearance_scores(None, 4.0, appearance_features, shape_features)
        self.assertGreater(scores["plastic"], scores["glass"])

    def test_lying_can_candidate_accepts_fragmented_metal_surface(self):
        features = CropFeatures(
            saturation_mean=0.30,
            value_mean=0.65,
            value_std=0.15,
            colorfulness=0.08,
            edge_ratio=0.06,
            specular_ratio=0.05,
            dark_ratio=0.05,
            extent=0.07,
            solidity=0.13,
            oriented_aspect_ratio=5.8,
        )
        scores = {"aluminum": 0.65, "glass": 0.20, "plastic": 0.20}
        self.assertEqual(
            material_from_class("cup", 0.17, False, 0, None, True, features, scores),
            "aluminum",
        )

    def test_can_shape_accepts_upright_and_lying_cans(self):
        self.assertTrue(is_can_shape(0.35, extent=0.7))
        self.assertTrue(is_can_shape(2.8, extent=0.7))
        self.assertTrue(is_can_shape(5.8, extent=0.24, solidity=0.42))
        self.assertTrue(is_lying_can_shape(5.8, extent=0.24, solidity=0.42))
        self.assertFalse(is_can_shape(0.35, extent=0.2))
        self.assertFalse(is_can_shape(1.0, extent=0.7))

    def test_lying_can_candidate_requires_both_geometry_signals(self):
        self.assertTrue(is_lying_can_candidate(5.8, extent=0.10, solidity=0.18))
        self.assertFalse(is_lying_can_shape(5.8, extent=0.09, solidity=0.18))
        self.assertTrue(is_lying_can_shape(5.8, extent=0.10, solidity=0.18))
        self.assertFalse(is_lying_can_shape(5.8, extent=0.29, solidity=0.0))
        self.assertFalse(is_lying_can_shape(5.8, extent=0.0, solidity=0.5))
        self.assertFalse(is_lying_can_candidate(1.0, extent=0.5, solidity=0.5))
        self.assertFalse(is_lying_can_candidate(0.35, extent=0.7, solidity=0.7))
        self.assertTrue(is_can_shape(0.35, extent=0.7))

    def test_lying_can_candidate_path_requires_metallic_evidence(self):
        features = CropFeatures(
            saturation_mean=0.30,
            value_mean=0.65,
            value_std=0.15,
            colorfulness=0.08,
            edge_ratio=0.06,
            specular_ratio=0.05,
            dark_ratio=0.05,
            extent=0.10,
            solidity=0.18,
            oriented_aspect_ratio=5.8,
        )
        scores = {"aluminum": 0.70, "glass": 0.20, "plastic": 0.20}
        self.assertEqual(
            material_from_class("cup", 0.17, False, 0, None, True, features, scores),
            "aluminum",
        )
        scores["aluminum"] = 0.40
        self.assertIsNone(material_from_class("cup", 0.17, False, 0, None, True, features, scores))

    def test_matte_white_surface_is_not_metallic(self):
        features = CropFeatures(
            saturation_mean=0.22,
            value_mean=0.86,
            value_std=0.04,
            colorfulness=0.02,
            edge_ratio=0.015,
            specular_ratio=0.005,
            dark_ratio=0.0,
            extent=0.65,
            solidity=0.75,
            oriented_aspect_ratio=2.5,
        )
        self.assertFalse(is_metallic_crop(None, features))

        scores = {"aluminum": 0.45, "glass": 0.20, "plastic": 0.72}
        self.assertEqual(
            material_from_class("bottle", 0.40, False, 0, None, True, features, scores),
            "plastic",
        )

    def test_shiny_glass_is_not_promoted_to_aluminum(self):
        features = CropFeatures(
            saturation_mean=0.25,
            value_mean=0.65,
            value_std=0.18,
            colorfulness=0.08,
            edge_ratio=0.06,
            specular_ratio=0.08,
            dark_ratio=0.05,
            extent=0.55,
            solidity=0.65,
            oriented_aspect_ratio=3.0,
        )
        scores = {"aluminum": 0.65, "glass": 0.85, "plastic": 0.25}
        self.assertEqual(
            material_from_class("bottle", 0.35, False, 0, None, True, features, scores),
            "glass",
        )

    def test_wine_glass_is_not_a_glass_bottle(self):
        features = CropFeatures(
            saturation_mean=0.25,
            value_mean=0.65,
            value_std=0.18,
            colorfulness=0.08,
            edge_ratio=0.06,
            specular_ratio=0.08,
            dark_ratio=0.05,
            extent=0.55,
            solidity=0.65,
            oriented_aspect_ratio=3.0,
        )
        scores = {"aluminum": 0.10, "glass": 0.85, "plastic": 0.15}
        self.assertIsNone(material_from_class("wine glass", 0.35, False, 0, None, True, features, scores))

    def test_lying_can_surface_accepts_dull_metal(self):
        features = CropFeatures(
            saturation_mean=0.38,
            value_mean=0.62,
            value_std=0.18,
            colorfulness=0.12,
            edge_ratio=0.05,
            specular_ratio=0.02,
            dark_ratio=0.1,
            extent=0.24,
            solidity=0.42,
        )
        self.assertTrue(has_metallic_surface(features))

    def test_lying_can_confidence_floors_stay_below_acceptance_thresholds(self):
        strict_features = CropFeatures(
            saturation_mean=0.3,
            value_mean=0.6,
            value_std=0.1,
            colorfulness=0.0,
            edge_ratio=0.0,
            specular_ratio=0.0,
            dark_ratio=0.0,
            extent=0.24,
            solidity=0.42,
            oriented_aspect_ratio=5.8,
        )
        strict_scores = {"aluminum": 0.0, "glass": 0.0, "plastic": 0.0}
        self.assertLess(
            confidence_for("cup", "aluminum", 0.0, 0.17, False, 0, None, True, strict_features, strict_scores),
            VISION_ONLY_MIN_ACCEPT_CONFIDENCE,
        )
        self.assertLess(
            confidence_for("cup", "aluminum", 0.0, 0.17, False, 0, None, False, strict_features, strict_scores),
            SENSOR_MIN_ACCEPT_CONFIDENCE,
        )


if __name__ == "__main__":
    unittest.main()
