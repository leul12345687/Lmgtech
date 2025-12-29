// src/customer-operations/customer-operations.service.ts
import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import sharp from 'sharp';
import * as Tesseract from 'tesseract.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nService } from 'nestjs-i18n';
import * as streamifier from 'streamifier';
import { BookingStatus, PaymentStatus } from '../booking/booking.schema';
import { Asset, AssetDocument } from '../property/property.schema';
import { Booking, BookingDocument } from '../booking/booking.schema';
import { User, UserDocument } from '../schema/user.schema';
import { CloudinaryService } from '../cloudinary/cloudinary.service'; // ✅ Correct import

interface ExtractedPaymentData {
  isCBE: boolean;
  accountNumber: string | null;
  amount: number | null;
  reference: string | null;
}
@Injectable()
export class CustomerOperationsService {
  private readonly logger = new Logger(CustomerOperationsService.name);

  constructor(
    @InjectModel(Asset.name) private readonly assetModel: Model<AssetDocument>,
    @InjectModel(Booking.name) private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly i18n: I18nService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}


// ===========================================================
async getPropertiesByCategory(category: string, lang?: string, customCategory?: string) {
  try {
    const query: any = { category };
    if (customCategory) query.customCategory = customCategory;

    const assets = await this.assetModel
      .find(query)
      .populate('merchant', 'fullName email phonenumber businessName acountnumber')
      .lean()
      .exec();

    if (!assets.length) {
      return {
        message: await this.i18n.translate('customer-operation.ERROR_NO_PROPERTY_FOUND', { lang }),
        category,
        totalProperties: 0,
        properties: [],
      };
    }

    const propertyIds = assets.map(a => a._id);

    const bookings = await this.bookingModel
      .find({ asset: { $in: propertyIds } })
      .select('asset startDate endDate numberOfProperty status')
      .lean();

    const bookingMap = bookings.reduce((acc, booking) => {
      const propertyId = booking.asset.toString();
      if (!acc[propertyId]) acc[propertyId] = [];
      acc[propertyId].push({
        startDate: booking.startDate,
        endDate: booking.endDate,
        numberOfProperty: booking.numberOfProperty,
        status: booking.status,
      });
      return acc;
    }, {} as Record<string, any[]>);

    const properties = assets.map(asset => {
      const merchant = asset.merchant as any;
      const propertyIdString = asset._id.toString();
      const associatedBookings = bookingMap[propertyIdString] || [];

      return {
        name: asset.name,
        description: asset.description,
        category: asset.category,
        customCategory: asset.customCategory || null,
        numberOfProperty: asset.numberOfProperty,
        status: asset.status,
        imageUrls: asset.imageUrls || [],
        rentalPrice: {
          perHour: asset.rentalPriceperhour,
          perDay: asset.rentalPriceperday,
          perWeek: asset.rentalPriceperweek,
          perMonth: asset.rentalPricepermonth,
          perYear: asset.rentalPriceperyear,
        },
        merchant: {
          name: merchant?.fullName || 'N/A',
          acountnumber: merchant?.acountnumber,
          email: merchant?.email || 'N/A',
          phone: merchant?.phonenumber || 'N/A',
          businessName: merchant?.businessName || 'N/A',
        },
        bookings: associatedBookings,
      };
    });

    return {
      message: await this.i18n.translate('customer-operation.SUCCESS_PROPERTY_FETCHED', { lang }),
      category,
      totalProperties: properties.length,
      properties,
    };
  } catch (error) {
    console.error('❌ Error fetching properties:', error);
    throw new InternalServerErrorException(
      await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
    );
  }
}

  // ===========================================================
  // 2️⃣ GET BOOKINGS CREATED BY LOGGED-IN CUSTOMER
  // ===========================================================
  
  async getMyBookings(customerId: Types.ObjectId, lang: string) {
    try {
      const bookings = await this.bookingModel
        .find({ customer: customerId })
        .populate('asset', 'name category numberOfProperty imageUrls')
        .populate('merchant', 'fullName email phonenumber businessName')
        .populate('customer', 'fullName email phonenumber')
        .lean()
        .exec();

      if (!bookings.length) {
        throw new NotFoundException(
          await this.i18n.translate(
            'customer-operation.ERROR_NO_BOOKING_FOUND',
            { lang },
          ),
        );
      }

      return {
        message: await this.i18n.translate(
          'customer-operation.SUCCESS_BOOKINGS_FETCHED',
          { lang },
        ),
        totalBookings: bookings.length,
        bookings: bookings.map((booking) => {
          const asset = booking.asset as any;
          const merchant = booking.merchant as any;
          const customer = booking.customer as any;
          return {
            bookingId: booking._id,
            assetName: asset?.name || 'N/A',
            category: asset?.category || 'N/A',
            numberOfProperty: booking?.numberOfProperty || 0,
            imageUrls: asset?.imageUrls || [],
            priceUnit: booking?.timeInterval || 'N/A',
            startDate: booking.startDate,
            endDate: booking.endDate,
            totalPrice: booking.totalPrice,
            status: booking.status,
            paymentProofPath: booking.paymentProofPath || null, // 👈 Added
            merchant: {
              name: merchant?.fullName || 'N/A',
              email: merchant?.email || 'N/A',
              phone: merchant?.phonenumber || 'N/A',
              businessName: merchant?.businessName || 'N/A',
            },
            bookedBy: {
              name: customer?.fullName || 'N/A',
              email: customer?.email || 'N/A',
              phone: customer?.phonenumber || 'N/A',
            },
          };
        }),
      };
    } catch (error) {
      console.error('❌ Error fetching bookings:', error);
      throw new InternalServerErrorException(
        await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
      );
    }
  }
 // 🧩 Helper — Upload any image to Cloudinary (Reusable)
  // ===========================================================
  private async uploadToCloudinary(file: Express.Multer.File, folder: string): Promise<string> {
  if (!file?.buffer) {
    this.logger.warn('⚠️ No file buffer provided for Cloudinary upload.');
    throw new BadRequestException('Invalid file upload.');
  }

  try {
    const url = await this.cloudinaryService.uploadImage(file, folder); // ✅ use the global CloudinaryService
    this.logger.log(`✅ Uploaded to Cloudinary folder "${folder}"`);
    return url;
  } catch (err) {
    this.logger.error(`❌ Cloudinary upload failed (${folder}):`, err);
    throw new InternalServerErrorException('Image upload failed.');
  }
}
// ===========================================================
// 3️⃣ GET ALL BOOKINGS (VISIBLE TO ALL LOGGED-IN CUSTOMERS)
// ===========================================================
async getAllBookings(lang: string) {
  try {
    const bookings = await this.bookingModel
      .find()
      .populate('asset', 'name category numberOfProperty imageUrls')
      .populate('merchant', 'email fullName businessName phonenumber')
      .exec(); // Removed .lean() to keep Mongoose documents if needed

    if (!bookings.length) {
      throw new NotFoundException(
        await this.i18n.translate('customer-operation.ERROR_NO_BOOKING_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('customer-operation.SUCCESS_BOOKINGS_FETCHED', { lang }),
      totalBookings: bookings.length,
      bookings: bookings.map((booking) => {
        const asset = booking.asset as any;
        const merchant = booking.merchant as any;
        return {
          bookingId: booking._id,
          propertyName: asset?.name || 'N/A',
          numberOfProperty: booking?.numberOfProperty || 0,
          merchantEmail: merchant?.email || 'N/A',
          merchantPhone: merchant?.phonenumber || 'N/A',
          businessName: merchant?.businessName || 'N/A',
          startDate: booking.startDate,
          endDate: booking.endDate,
          paymentProofPath: booking.paymentProofPath || 'no payment proven',
          imageUrls: asset?.imageUrls || [],
        };
      }),
    };
  } catch (error) {
    console.error('❌ Error fetching all bookings:', error);
    throw new InternalServerErrorException(
      await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
    );
  }
}

// ===========================================================
// 5️⃣ UPDATE BOOKING (BY MANAGER)
// ===========================================================
async updateBookingByManager(
  bookingId: string,
  updateData: Partial<Booking>,
  lang?: string,
) {
  try {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }

    const updatedBooking = await this.bookingModel.findByIdAndUpdate(
      bookingId,
      updateData,
      { new: true, runValidators: true }, // return updated doc + validate
    );

    if (!updatedBooking) {
      throw new NotFoundException(
        await this.i18n.translate('customer-operation.ERROR_BOOKING_NOT_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('customer-operation.SUCCESS_BOOKING_UPDATED', { lang }),
      updatedBooking,
    };
  } catch (error) {
    console.error('❌ Error updating booking by manager:', error);
    throw new InternalServerErrorException(
      await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
    );
  }
}

// ===========================================================
// 6️⃣ DELETE BOOKING (BY MANAGER)
// ===========================================================
async deleteBookingByManager(
  bookingId: string,
  lang?: string,
) {
  try {
    if (!Types.ObjectId.isValid(bookingId)) {
      throw new BadRequestException('Invalid booking ID');
    }

    const deletedBooking = await this.bookingModel.findByIdAndDelete(bookingId);

    if (!deletedBooking) {
      throw new NotFoundException(
        await this.i18n.translate('customer-operation.ERROR_BOOKING_NOT_FOUND', { lang }),
      );
    }

    return {
      message: await this.i18n.translate('customer-operation.SUCCESS_BOOKING_DELETED', { lang }),
      bookingId,
    };
  } catch (error) {
    console.error('❌ Error deleting booking by manager:', error);
    throw new InternalServerErrorException(
      await this.i18n.translate('customer-operation.ERROR_INTERNAL', { lang }),
    );
  }
}


}