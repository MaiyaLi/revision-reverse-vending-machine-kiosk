import unittest

from scripts.yolo_detect import canonical_item_name, is_can_shape, orientation_invariant_aspect_ratio


class VisionContractTests(unittest.TestCase):
    def test_canonical_item_names(self):
        self.assertEqual(canonical_item_name("aluminum"), "Aluminum Can")
        self.assertEqual(canonical_item_name("plastic"), "Plastic Bottle")
        self.assertEqual(canonical_item_name("glass"), "Glass Bottle")

    def test_orientation_invariant_aspect_ratio(self):
        self.assertAlmostEqual(orientation_invariant_aspect_ratio(0.25), 4.0)
        self.assertAlmostEqual(orientation_invariant_aspect_ratio(4.0), 4.0)

    def test_can_shape_accepts_upright_and_lying_cans(self):
        self.assertTrue(is_can_shape(0.35, extent=0.7))
        self.assertTrue(is_can_shape(3.8, extent=0.7))
        self.assertFalse(is_can_shape(0.35, extent=0.2))


if __name__ == "__main__":
    unittest.main()
