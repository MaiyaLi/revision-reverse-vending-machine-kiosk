import unittest

from scripts.yolo_detect import (
    CropFeatures,
    SENSOR_MIN_ACCEPT_CONFIDENCE,
    VISION_ONLY_MIN_ACCEPT_CONFIDENCE,
    canonical_item_name,
    confidence_for,
    effective_aspect_ratio,
    has_metallic_surface,
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
            extent=0.1,
            solidity=0.5,
            oriented_aspect_ratio=3.6,
        )
        self.assertEqual(effective_aspect_ratio(0.2, features), 5.0)

    def test_can_shape_accepts_upright_and_lying_cans(self):
        self.assertTrue(is_can_shape(0.35, extent=0.7))
        self.assertTrue(is_can_shape(2.8, extent=0.7))
        self.assertTrue(is_can_shape(5.8, extent=0.24, solidity=0.42))
        self.assertTrue(is_lying_can_shape(5.8, extent=0.24, solidity=0.42))
        self.assertFalse(is_can_shape(0.35, extent=0.2))
        self.assertFalse(is_can_shape(1.0, extent=0.7))

    def test_lying_can_candidate_requires_both_geometry_signals(self):
        self.assertTrue(is_lying_can_candidate(5.8, extent=0.10, solidity=0.18))
        self.assertFalse(is_lying_can_shape(5.8, extent=0.10, solidity=0.18))
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
